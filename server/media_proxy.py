#!/usr/bin/env python3
import http.server
import urllib.request
import urllib.parse
import json
import os
import subprocess
import tempfile
import sys
import io
import re

AUTUMN_UPSTREAM = "http://127.0.0.1:14704"
LISTEN_HOST = "172.18.0.1"
LISTEN_PORT = 14708
ANIMATED_STORE = "/opt/liecord/data/animated_avatars.json"
SUPPORTED_TAGS = {"avatars", "icons", "banners", "backgrounds"}
MAX_BODY_SIZE = 35 * 1024 * 1024  # 35 MB payload limit to prevent OOM

os.makedirs("/opt/liecord/data", exist_ok=True)

def load_animated_ids():
    if os.path.exists(ANIMATED_STORE):
        try:
            with open(ANIMATED_STORE, "r") as f:
                return set(json.load(f))
        except Exception as e:
            print(f"Error loading animated ids: {e}", flush=True)
    return set()

def save_animated_id(file_id):
    ids = load_animated_ids()
    ids.add(file_id)
    try:
        with open(ANIMATED_STORE, "w") as f:
            json.dump(list(ids), f)
    except Exception as e:
        print(f"Error saving animated id: {e}", flush=True)

animated_ids = load_animated_ids()

def is_video_data(data, filename="", content_type=""):
    ct = (content_type or "").lower()
    fn = (filename or "").lower()
    if "crop_" in fn and (ct == "image/gif" or fn.endswith(".gif") or (len(data) > 10 and data[:6] in [b"GIF87a", b"GIF89a"])):
        return True
    if ct.startswith("video/"):
        return True
    for ext in [".mp4", ".mov", ".webm", ".mkv", ".avi", ".m4v", ".flv", ".3gp", ".wmv", ".ts"]:
        if fn.endswith(ext):
            return True
    if len(data) >= 12:
        tag = data[4:8]
        if tag in [b"ftyp", b"moov", b"wide", b"mdat"]:
            return True
        if data[:4] == b"\x1a\x45\xdf\xa3":
            return True
        if data[:4] == b"RIFF" and data[8:12] == b"AVI ":
            return True
    return False

def is_animated_image(data):
    if len(data) > 10 and data[:6] in [b"GIF87a", b"GIF89a"]:
        return data.count(b"\x21\xf9") > 1
    if len(data) > 30 and data[:4] == b"RIFF" and data[8:12] == b"WEBP":
        if b"ANIM" in data or (b"VP8X" in data and len(data) > 20 and (data[20] & 0x02)):
            return True
    return False

def transcode_video_to_webp(input_bytes, tag="avatars", crop_coords=None):
    with tempfile.NamedTemporaryFile(suffix=".tmp", delete=False) as in_f:
        in_f.write(input_bytes)
        in_path = in_f.name

    out_path = in_path + ".webp"
    try:
        if crop_coords:
            cx, cy, cw, ch = crop_coords
            if tag in ["avatars", "icons"]:
                scale_filter = f"crop={cw}:{ch}:{cx}:{cy},fps=24,scale=256:256"
            elif tag == "backgrounds":
                scale_filter = f"crop={cw}:{ch}:{cx}:{cy},fps=24,scale=960:267"
            else:
                scale_filter = f"crop={cw}:{ch}:{cx}:{cy},fps=24,scale=960:480"
        else:
            if tag in ["avatars", "icons"]:
                scale_filter = "fps=24,scale=256:256:force_original_aspect_ratio=increase,crop=256:256"
            elif tag == "backgrounds":
                scale_filter = "fps=24,scale=960:267:force_original_aspect_ratio=increase,crop=960:267"
            else:
                scale_filter = "fps=24,scale=960:480:force_original_aspect_ratio=increase,crop=960:480"

        cmd = [
            "ffmpeg", "-y", "-i", in_path,
            "-t", "15",
            "-vf", scale_filter,
            "-vcodec", "libwebp",
            "-lossless", "0",
            "-compression_level", "4",
            "-q:v", "75",
            "-loop", "0",
            "-an",
            out_path
        ]
        res = subprocess.run(cmd, stdout=subprocess.PIPE, stderr=subprocess.PIPE, timeout=30)
        if res.returncode != 0 or not os.path.exists(out_path) or os.path.getsize(out_path) == 0:
            print(f"FFmpeg error: {res.stderr.decode('utf-8', errors='ignore')}", flush=True)
            return None

        if os.path.getsize(out_path) > 15_000_000:
            os.remove(out_path)
            cmd = [
                "ffmpeg", "-y", "-i", in_path,
                "-t", "10",
                "-vf", "fps=20,scale=200:200:force_original_aspect_ratio=increase,crop=200:200" if tag in ["avatars", "icons"] else "fps=20,scale=640:360:force_original_aspect_ratio=increase,crop=640:360",
                "-vcodec", "libwebp",
                "-lossless", "0",
                "-compression_level", "4",
                "-q:v", "60",
                "-loop", "0",
                "-an",
                out_path
            ]
            subprocess.run(cmd, stdout=subprocess.PIPE, stderr=subprocess.PIPE, timeout=30)

        with open(out_path, "rb") as out_f:
            return out_f.read()
    except subprocess.TimeoutExpired:
        print(f"FFmpeg transcode timed out (exceeded 30s)", flush=True)
        return None
    except Exception as e:
        print(f"Transcode error: {e}", flush=True)
        return None
    finally:
        if os.path.exists(in_path):
            try:
                os.remove(in_path)
            except OSError:
                pass
        if os.path.exists(out_path):
            try:
                os.remove(out_path)
            except OSError:
                pass

class ProxyHandler(http.server.BaseHTTPRequestHandler):
    def do_OPTIONS(self):
        self.send_response(200)
        self.send_header("Access-Control-Allow-Origin", "*")
        self.send_header("Access-Control-Allow-Methods", "GET, POST, OPTIONS, DELETE, HEAD, PUT, PATCH")
        self.send_header("Access-Control-Allow-Headers", "*")
        self.end_headers()

    def do_GET(self):
        parsed = urllib.parse.urlparse(self.path)
        path = parsed.path
        parts = [p for p in path.split("/") if p]

        if len(parts) >= 2 and parts[0] in SUPPORTED_TAGS:
            file_id = parts[1]
            global animated_ids
            if file_id in animated_ids:
                try:
                    orig_url = f"{AUTUMN_UPSTREAM}/{parts[0]}/{file_id}/original"
                    req = urllib.request.Request(orig_url, headers={"User-Agent": "LieCordMediaProxy/1.0"})
                    with urllib.request.urlopen(req, timeout=10) as resp:
                        data = resp.read()
                        content_type = resp.headers.get("Content-Type", "image/webp")
                        self.send_response(200)
                        self.send_header("Content-Type", content_type)
                        self.send_header("Content-Disposition", "inline")
                        self.send_header("Cache-Control", "public, max-age=604800, must-revalidate")
                        self.send_header("Access-Control-Allow-Origin", "*")
                        self.send_header("Content-Length", str(len(data)))
                        self.end_headers()
                        self.wfile.write(data)
                        return
                except Exception as e:
                    print(f"Error serving animated asset {file_id}: {e}", flush=True)

        self._proxy_request("GET")

    def do_HEAD(self):
        self._proxy_request("HEAD")

    def do_DELETE(self):
        self._proxy_request("DELETE")

    def do_POST(self):
        parsed = urllib.parse.urlparse(self.path)
        path = parsed.path
        parts = [p for p in path.split("/") if p]
        tag = parts[0] if parts else ""

        try:
            content_length = int(self.headers.get("Content-Length", 0))
        except (ValueError, TypeError):
            content_length = 0

        if content_length > MAX_BODY_SIZE:
            self.send_response(413, "Payload Too Large")
            self.send_header("Access-Control-Allow-Origin", "*")
            self.end_headers()
            self.wfile.write(b'{"error":"File size exceeds maximum allowed limit (35MB)"}')
            return

        content_type = self.headers.get("Content-Type", "")

        if tag in SUPPORTED_TAGS and "multipart/form-data" in content_type:
            body = self.rfile.read(content_length)

            boundary_match = re.search(r'boundary=([^\s;]+)', content_type)
            if boundary_match:
                boundary = boundary_match.group(1).encode()
                if boundary.startswith(b'"') and boundary.endswith(b'"'):
                    boundary = boundary[1:-1]
                delimiter = b"--" + boundary

                parts_data = list(body.split(delimiter))
                file_is_video = False
                file_is_animated = False
                body_modified = False

                for i in range(1, len(parts_data) - 1):
                    p = parts_data[i]
                    if not p.startswith(b"\r\n") and not p.startswith(b"\n"):
                        continue
                    c_end = b"\r\n"
                    if b"\r\n\r\n" in p:
                        header_part, content_part = p.split(b"\r\n\r\n", 1)
                        if content_part.endswith(b"\r\n"):
                            content_part = content_part[:-2]
                    elif b"\n\n" in p:
                        header_part, content_part = p.split(b"\n\n", 1)
                        c_end = b"\n"
                        if content_part.endswith(b"\n"):
                            content_part = content_part[:-1]
                    else:
                        continue

                    header_text = header_part.decode("utf-8", errors="ignore")
                    if 'name="file"' in header_text:
                        fn_match = re.search(r'filename="([^"]+)"', header_text)
                        ct_match = re.search(r'Content-Type:\s*([^\r\n]+)', header_text, re.I)
                        fname = fn_match.group(1) if fn_match else "file"
                        fctype = ct_match.group(1).strip() if ct_match else ""

                        if is_video_data(content_part, fname, fctype):
                            file_is_video = True
                            crop_coords = None
                            crop_match = re.search(r"crop_(\d+)_(\d+)_(\d+)_(\d+)", fname)
                            if crop_match:
                                crop_coords = [int(v) for v in crop_match.groups()]
                                print(f"Detected explicit crop coordinates from filename: {crop_coords}", flush=True)

                            print(f"Transcoding {tag} video ({fname}, {len(content_part)} bytes) to infinite-loop WebP...", flush=True)
                            webp_bytes = transcode_video_to_webp(content_part, tag=tag, crop_coords=crop_coords)
                            if webp_bytes:
                                print(f"Transcoded successfully! WebP size: {len(webp_bytes)} bytes", flush=True)
                                new_header = re.sub(r'filename="[^"]+"', f'filename="{tag}.webp"', header_text)
                                if "Content-Type:" in new_header:
                                    new_header = re.sub(r'Content-Type:\s*[^\r\n]+', 'Content-Type: image/webp', new_header, flags=re.I)
                                else:
                                    new_header += "\r\nContent-Type: image/webp"
                                parts_data[i] = new_header.encode("utf-8") + b"\r\n\r\n" + webp_bytes + c_end
                                file_is_animated = True
                                body_modified = True
                            else:
                                print("Transcode failed, falling back to original bytes", flush=True)
                        elif is_animated_image(content_part):
                            file_is_animated = True

                if body_modified:
                    body = delimiter.join(parts_data)

                upstream_url = f"{AUTUMN_UPSTREAM}{self.path}"
                headers = {}
                for k, v in self.headers.items():
                    if k.lower() not in ["host", "content-length"]:
                        headers[k] = v
                headers["Content-Length"] = str(len(body))
                headers["Host"] = "127.0.0.1:14704"

                req = urllib.request.Request(upstream_url, data=body, headers=headers, method="POST")
                try:
                    with urllib.request.urlopen(req, timeout=60) as resp:
                        resp_data = resp.read()
                        status = resp.status
                        resp_headers = resp.headers

                        if status == 200 and file_is_animated:
                            try:
                                resp_json = json.loads(resp_data.decode("utf-8"))
                                if "id" in resp_json:
                                    aid = resp_json["id"]
                                    print(f"Tracking animated asset ID: {aid}", flush=True)
                                    save_animated_id(aid)
                                    animated_ids.add(aid)
                            except Exception as e:
                                print(f"Error parsing upload response: {e}", flush=True)

                        self.send_response(status)
                        for hk, hv in resp_headers.items():
                            if hk.lower() not in ["content-length", "transfer-encoding"]:
                                self.send_header(hk, hv)
                        self.send_header("Access-Control-Allow-Origin", "*")
                        self.send_header("Content-Length", str(len(resp_data)))
                        self.end_headers()
                        self.wfile.write(resp_data)
                        return
                except urllib.error.HTTPError as e:
                    err_data = e.read()
                    print(f"Autumn HTTPError {e.code}: {err_data.decode('utf-8', errors='ignore')}", flush=True)
                    self.send_response(e.code)
                    for hk, hv in e.headers.items():
                        if hk.lower() not in ["content-length", "transfer-encoding"]:
                            self.send_header(hk, hv)
                    self.send_header("Access-Control-Allow-Origin", "*")
                    self.send_header("Content-Length", str(len(err_data)))
                    self.end_headers()
                    self.wfile.write(err_data)
                    return
                except Exception as e:
                    print(f"Upstream error: {e}", flush=True)
                    self.send_response(502)
                    self.end_headers()
                    return

        self._proxy_request("POST")

    def _proxy_request(self, method):
        try:
            content_length = int(self.headers.get("Content-Length", 0))
        except (ValueError, TypeError):
            content_length = 0

        if content_length > MAX_BODY_SIZE:
            self.send_response(413, "Payload Too Large")
            self.send_header("Access-Control-Allow-Origin", "*")
            self.end_headers()
            self.wfile.write(b'{"error":"Payload size exceeds limit (35MB)"}')
            return

        upstream_url = f"{AUTUMN_UPSTREAM}{self.path}"
        headers = {}
        for k, v in self.headers.items():
            if k.lower() not in ["host", "content-length"]:
                headers[k] = v
        headers["Host"] = "127.0.0.1:14704"

        body = None
        if method in ["POST", "PUT", "PATCH"] and content_length > 0:
            body = self.rfile.read(content_length)
            headers["Content-Length"] = str(len(body))

        req = urllib.request.Request(upstream_url, data=body, headers=headers, method=method)
        try:
            with urllib.request.urlopen(req, timeout=30) as resp:
                data = resp.read()
                self.send_response(resp.status)
                for hk, hv in resp.headers.items():
                    if hk.lower() not in ["content-length", "transfer-encoding"]:
                        self.send_header(hk, hv)
                self.send_header("Access-Control-Allow-Origin", "*")
                self.send_header("Content-Length", str(len(data)))
                self.end_headers()
                if method != "HEAD":
                    self.wfile.write(data)
        except urllib.error.HTTPError as e:
            err_data = e.read()
            self.send_response(e.code)
            for hk, hv in e.headers.items():
                if hk.lower() not in ["content-length", "transfer-encoding"]:
                    self.send_header(hk, hv)
            self.send_header("Access-Control-Allow-Origin", "*")
            self.send_header("Content-Length", str(len(err_data)))
            self.end_headers()
            if method != "HEAD":
                self.wfile.write(err_data)
        except Exception as e:
            print(f"Proxy error {method} {self.path}: {e}", flush=True)
            self.send_response(502)
            self.end_headers()

if __name__ == "__main__":
    server = http.server.ThreadingHTTPServer((LISTEN_HOST, LISTEN_PORT), ProxyHandler)
    print(f"LieCord Media Proxy running on {LISTEN_HOST}:{LISTEN_PORT} -> {AUTUMN_UPSTREAM}", flush=True)
    server.serve_forever()
