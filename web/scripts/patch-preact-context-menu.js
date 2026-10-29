const fs = require('fs');
const path = require('path');

const utilPath = path.resolve(__dirname, '../node_modules/preact-context-menu/dist/util.js');
const menuPath = path.resolve(__dirname, '../node_modules/preact-context-menu/dist/menu.js');

if (fs.existsSync(utilPath)) {
    let utilCode = fs.readFileSync(utilPath, 'utf8');

    // Replace useTriggerEvents with universal long-press touch & contextmenu handler
    const patchedUtil = `import { contextMenus, menuOffset } from "./menu";
var currentMouseCoords = { x: 0, y: 0 };
if (typeof window !== 'undefined') {
    document.addEventListener("mousemove", function (event) {
        return currentMouseCoords = { x: event.clientX, y: event.clientY };
    });
}
/**
 * Open a context menu by its ID.
 * @param id Context Menu ID
 * @param data Data to pass to callback function
 * @param coords Coordinates to place context menu at
 */
export var openContextMenu = function (id, data, coords) {
    var fn = contextMenus.get(id);
    if (fn === undefined)
        throw new Error("There is no ContextMenu with the ID " + id);
    fn(coords ? { x: coords.x - menuOffset, y: coords.y - menuOffset } : currentMouseCoords, data);
};
var timeout = 0;

/**
 * Universal Context Menu Trigger events (Desktop contextmenu + Mobile touch long-press)
 */
export var useTriggerEvents = function (id, data, disabled, touchTimeout) {
    if (touchTimeout === void 0) { touchTimeout = 420; }

    var onContextMenu = function (event) {
        if (disabled === true) return;
        openContextMenu(id, data, { x: event.clientX, y: event.clientY });
        event.stopPropagation();
        event.preventDefault();
    };

    var startX = 0;
    var startY = 0;
    var isTriggered = false;

    var onTouchStart = function (event) {
        if (disabled === true) return;
        if (!event.touches || event.touches.length !== 1) return;
        var touch = event.touches[0];
        startX = touch.clientX;
        startY = touch.clientY;
        isTriggered = false;
        clearTimeout(timeout);
        timeout = setTimeout(function () {
            isTriggered = true;
            try {
                if (typeof window !== "undefined" && window.LieCordNative && window.LieCordNative.vibrate) {
                    window.LieCordNative.vibrate(35);
                } else if (navigator && navigator.vibrate) {
                    navigator.vibrate(35);
                }
            } catch (_) {}
            openContextMenu(id, data, { x: startX, y: startY });
        }, touchTimeout);
    };

    var onTouchMove = function (event) {
        if (event.touches && event.touches.length === 1) {
            var touch = event.touches[0];
            var dist = Math.hypot(touch.clientX - startX, touch.clientY - startY);
            if (dist > 10) {
                clearTimeout(timeout);
            }
        } else {
            clearTimeout(timeout);
        }
    };

    var onTouchEnd = function (event) {
        clearTimeout(timeout);
        if (isTriggered) {
            if (event.cancelable) {
                event.preventDefault();
            }
            event.stopPropagation();
        }
    };

    var onTouchCancel = function () {
        clearTimeout(timeout);
    };

    return {
        onContextMenu: onContextMenu,
        onTouchStart: onTouchStart,
        onTouchMove: onTouchMove,
        onTouchEnd: onTouchEnd,
        onTouchCancel: onTouchCancel
    };
};
`;
    fs.writeFileSync(utilPath, patchedUtil, 'utf8');
    console.log("Patched preact-context-menu util.js");
}

if (fs.existsSync(menuPath)) {
    let menuCode = fs.readFileSync(menuPath, 'utf8');
    
    // Add touchstart listener for clicking away on mobile
    if (!menuCode.includes("touchstart', onClickAway")) {
        menuCode = menuCode.replace(
            "document.addEventListener('mousedown', onClickAway);",
            "document.addEventListener('mousedown', onClickAway);\n            document.addEventListener('touchstart', onClickAway);"
        );
        menuCode = menuCode.replace(
            "return function () { return document.removeEventListener('mousedown', onClickAway); };",
            "return function () {\n                document.removeEventListener('mousedown', onClickAway);\n                document.removeEventListener('touchstart', onClickAway);\n            };"
        );
    }

    // Ensure bounds on mobile (x and y >= 8)
    if (!menuCode.includes("if (x < 8)")) {
        menuCode = menuCode.replace(
            "setPlacement({ x: x, y: y });",
            "if (x < 8) x = 8;\n            if (y < 8) y = 8;\n            setPlacement({ x: x, y: y });"
        );
    }

    fs.writeFileSync(menuPath, menuCode, 'utf8');
    console.log("Patched preact-context-menu menu.js");
}
