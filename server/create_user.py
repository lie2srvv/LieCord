#!/usr/bin/env python3
import sys, os, time, random, string, base64, subprocess, json

try:
    from argon2.low_level import hash_secret_raw, Type
except ImportError:
    print("Error: argon2-cffi is not installed. Run: pip3 install argon2-cffi")
    sys.exit(1)

def ulid():
    t = int(time.time() * 1000)
    ENCODING = "0123456789ABCDEFGHJKMNPQRSTVWXYZ"
    res = []
    for _ in range(10):
        res.append(ENCODING[t % 32])
        t //= 32
    time_part = "".join(reversed(res))
    rand_part = "".join(random.choices(ENCODING, k=16))
    return time_part + rand_part

def hash_pw(pw: str) -> str:
    salt = os.urandom(16)
    raw = hash_secret_raw(
        secret=pw.encode("utf-8"),
        salt=salt,
        time_cost=3,
        memory_cost=4096,
        parallelism=1,
        hash_len=32,
        type=Type.I
    )
    b64_salt = base64.b64encode(salt).decode("ascii").rstrip("=")
    b64_hash = base64.b64encode(raw).decode("ascii").rstrip("=")
    return f"$argon2i$v=19$m=4096,t=3,p=1${b64_salt}${b64_hash}"

def main():
    if len(sys.argv) < 4:
        print("Usage: /opt/liecord/create_user.sh <username> <email> <password>")
        sys.exit(1)

    username = sys.argv[1].strip()
    email = sys.argv[2].strip()
    password = sys.argv[3]

    user_id = ulid()
    hashed_password = hash_pw(password)
    discriminator = f"{random.randint(1000, 9999):04d}"
    now_ms = int(time.time() * 1000)

    account_doc = {
        "_id": user_id,
        "email": email,
        "email_normalised": email.lower(),
        "password": hashed_password,
        "disabled": False,
        "deletion": None,
        "lockout": None,
        "mfa": {},
        "password_reset": None,
        "verification": {"status": "Verified"}
    }

    user_doc = {
        "_id": user_id,
        "username": username,
        "discriminator": discriminator,
        "relations": [],
        "last_acknowledged_policy_change": now_ms
    }

    account_json = json.dumps(account_doc)
    user_json = json.dumps(user_doc)

    mongo_script = (
        f"var existing = db.accounts.findOne({{ email_normalised: '{email.lower()}' }});\n"
        f"if (existing) {{\n"
        f"    print('EXISTS');\n"
        f"}} else {{\n"
        f"    db.accounts.insertOne({account_json});\n"
        f"    db.users.insertOne({user_json});\n"
        f"    print('SUCCESS');\n"
        f"}}\n"
    )

    res = subprocess.run(
        ["docker", "exec", "-i", "stoat-database-1", "mongosh", "revolt", "--quiet", "--eval", mongo_script],
        capture_output=True,
        text=True
    )

    out = res.stdout.strip()
    if "EXISTS" in out:
        print(f"Error: An account with email {email} already exists!")
        sys.exit(1)
    elif "SUCCESS" in out:
        print(f"User created successfully!")
        print(f"User ID:       {user_id}")
        print(f"Username:      {username}#{discriminator}")
        print(f"Email:         {email}")
    else:
        print("MongoDB error:", res.stderr or res.stdout)
        sys.exit(1)

if __name__ == "__main__":
    main()
