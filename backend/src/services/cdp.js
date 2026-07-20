"use strict";
var __extends = (this && this.__extends) || (function () {
    var extendStatics = function (d, b) {
        extendStatics = Object.setPrototypeOf ||
            ({ __proto__: [] } instanceof Array && function (d, b) { d.__proto__ = b; }) ||
            function (d, b) { for (var p in b) if (Object.prototype.hasOwnProperty.call(b, p)) d[p] = b[p]; };
        return extendStatics(d, b);
    };
    return function (d, b) {
        if (typeof b !== "function" && b !== null)
            throw new TypeError("Class extends value " + String(b) + " is not a constructor or null");
        extendStatics(d, b);
        function __() { this.constructor = d; }
        d.prototype = b === null ? Object.create(b) : (__.prototype = b.prototype, new __());
    };
})();
var __awaiter = (this && this.__awaiter) || function (thisArg, _arguments, P, generator) {
    function adopt(value) { return value instanceof P ? value : new P(function (resolve) { resolve(value); }); }
    return new (P || (P = Promise))(function (resolve, reject) {
        function fulfilled(value) { try { step(generator.next(value)); } catch (e) { reject(e); } }
        function rejected(value) { try { step(generator["throw"](value)); } catch (e) { reject(e); } }
        function step(result) { result.done ? resolve(result.value) : adopt(result.value).then(fulfilled, rejected); }
        step((generator = generator.apply(thisArg, _arguments || [])).next());
    });
};
var __generator = (this && this.__generator) || function (thisArg, body) {
    var _ = { label: 0, sent: function() { if (t[0] & 1) throw t[1]; return t[1]; }, trys: [], ops: [] }, f, y, t, g = Object.create((typeof Iterator === "function" ? Iterator : Object).prototype);
    return g.next = verb(0), g["throw"] = verb(1), g["return"] = verb(2), typeof Symbol === "function" && (g[Symbol.iterator] = function() { return this; }), g;
    function verb(n) { return function (v) { return step([n, v]); }; }
    function step(op) {
        if (f) throw new TypeError("Generator is already executing.");
        while (g && (g = 0, op[0] && (_ = 0)), _) try {
            if (f = 1, y && (t = op[0] & 2 ? y["return"] : op[0] ? y["throw"] || ((t = y["return"]) && t.call(y), 0) : y.next) && !(t = t.call(y, op[1])).done) return t;
            if (y = 0, t) op = [op[0] & 2, t.value];
            switch (op[0]) {
                case 0: case 1: t = op; break;
                case 4: _.label++; return { value: op[1], done: false };
                case 5: _.label++; y = op[1]; op = [0]; continue;
                case 7: op = _.ops.pop(); _.trys.pop(); continue;
                default:
                    if (!(t = _.trys, t = t.length > 0 && t[t.length - 1]) && (op[0] === 6 || op[0] === 2)) { _ = 0; continue; }
                    if (op[0] === 3 && (!t || (op[1] > t[0] && op[1] < t[3]))) { _.label = op[1]; break; }
                    if (op[0] === 6 && _.label < t[1]) { _.label = t[1]; t = op; break; }
                    if (t && _.label < t[2]) { _.label = t[2]; _.ops.push(op); break; }
                    if (t[2]) _.ops.pop();
                    _.trys.pop(); continue;
            }
            op = body.call(thisArg, _);
        } catch (e) { op = [6, e]; y = 0; } finally { f = t = 0; }
        if (op[0] & 5) throw op[1]; return { value: op[0] ? op[1] : void 0, done: true };
    }
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.cdpService = void 0;
var db_js_1 = require("./db.js");
var chrome_remote_interface_1 = require("chrome-remote-interface");
var events_1 = require("events");
var crypto_1 = require("crypto");
var CAPTURE_SCRIPT = "\n(async () => {\n  let container =\n    document.querySelector('.scrollbar-hide[class*=\"overflow-y-auto\"]') ||\n    document.querySelector('[data-testid=\"conversation-view\"]') ||\n    document.getElementById('conversation') ||\n    document.getElementById('chat') ||\n    document.getElementById('cascade');\n\n  if (!container || container.clientHeight === 0) {\n    const inputBox = document.getElementById('antigravity.agentSidePanelInputBox');\n    if (inputBox) {\n      let newSessionRoot = inputBox;\n      for (let i = 0; i < 10; i++) {\n        if (!newSessionRoot.parentElement) break;\n        newSessionRoot = newSessionRoot.parentElement;\n        if ((newSessionRoot.className || '').includes('animate-fade-in')) break;\n      }\n      container = newSessionRoot;\n    }\n  }\n\n  if (!container) return { html: '', css: '', agentRunning: false };\n\n  const stopBtn =\n    document.querySelector('[data-tooltip-id=\"input-send-button-cancel-tooltip\"]') ||\n    document.querySelector('button svg.lucide-square')?.closest('button');\n  const agentRunning = !!(stopBtn && stopBtn.offsetParent !== null);\n\n  const clone = container.cloneNode(true);\n  \n  // Clean up unwanted elements (like the input area itself if we're not on new session)\n  const isNewSession = !document.querySelector('.scrollbar-hide[class*=\"overflow-y-auto\"]');\n  if (!isNewSession) {\n    clone.querySelectorAll('[contenteditable=\"true\"], [data-lexical-editor], [role=\"textbox\"], form').forEach(el => {\n      let target = el;\n      while (target.parentElement && target.parentElement !== clone) {\n        target = target.parentElement;\n      }\n      target.remove();\n    });\n\n    // We only want to stream the CURRENT (last) assistant response to avoid duplicating history.\n    let listContainer = clone;\n    // Walk down up to 3 levels to find a container with more than 1 child (the message list)\n    for (let i = 0; i < 3; i++) {\n      if (listContainer.children.length === 1) {\n        listContainer = listContainer.firstElementChild;\n      } else {\n        break;\n      }\n    }\n    // If it has multiple children, assume it's the message list. Keep only the last one.\n    if (listContainer && listContainer.children.length > 1) {\n      while (listContainer.children.length > 1) {\n        listContainer.firstElementChild.remove();\n      }\n    }\n  }\n  // -- Convert images to base64 to fix cross-origin blob/relative URL issues --\n  const imgs = clone.querySelectorAll('img');\n  for (const img of imgs) {\n    if (img.src && !img.src.startsWith('data:')) {\n      try {\n        const res = await fetch(img.src);\n        const blob = await res.blob();\n        const reader = new FileReader();\n        const base64data = await new Promise(resolve => {\n          reader.onloadend = () => resolve(reader.result);\n          reader.readAsDataURL(blob);\n        });\n        img.src = base64data;\n        img.removeAttribute('srcset');\n      } catch (e) {}\n    }\n  }\n\n  let html = clone.innerHTML;\n  html = html.replace(/class=\"([^\"]*)\"/g, (match, classes) => {\n    if (!classes.includes('[object Object]')) return match;\n    const cleaned = classes.replace(/\\[object Object\\]/g, '').replace(/\\s+/g, ' ').trim();\n    return 'class=\"' + cleaned + '\"';\n  });\n\n  let css = '';\n  const rootStyle = getComputedStyle(document.documentElement);\n  const bodyStyle = document.body ? getComputedStyle(document.body) : null;\n  const themeRules = [];\n  const seen = new Set();\n  for (const source of [rootStyle, bodyStyle]) {\n    if (!source) continue;\n    for (const name of source) {\n      if (name.startsWith('--') && !seen.has(name)) {\n        const val = source.getPropertyValue(name).trim();\n        if (val) {\n          themeRules.push(name + ':' + val);\n          seen.add(name);\n        }\n      }\n    }\n  }\n  if (themeRules.length > 0) {\n    css = ':root{' + themeRules.join(';') + '}\\n' + css;\n  }\n\n  // -- Detect \"Proceed\" button (artifact RequestFeedback) --\n  // AG renders a small play-icon button when it wants user to confirm a plan.\n  // It can show as a button with text \"Proceed\" or as a play-triangle SVG button.\n  let proceedAvailable = false;\n  let proceedLabel = '';\n  try {\n    const allBtns = Array.from(document.querySelectorAll('button'));\n    for (const btn of allBtns) {\n      const text = (btn.textContent || '').trim();\n      if (/^Proceed$/i.test(text) && btn.offsetParent !== null) {\n        proceedAvailable = true;\n        proceedLabel = text;\n        break;\n      }\n    }\n    // Also check for the play-triangle SVG button (lucide-play icon)\n    if (!proceedAvailable) {\n      const playSvg = document.querySelector('button svg.lucide-play');\n      if (playSvg) {\n        const btn = playSvg.closest('button');\n        if (btn && btn.offsetParent !== null) {\n          proceedAvailable = true;\n          proceedLabel = 'Proceed';\n        }\n      }\n    }\n  } catch {}\n\n  // -- Detect permission/approval banner --\n  // AG shows a radiogroup + Allow/Deny buttons when it needs command approval.\n  let permissionBanner = null;\n  try {\n    const radioGroup = document.querySelector('[role=\"radiogroup\"]');\n    if (radioGroup) {\n      let banner = radioGroup;\n      for (let i = 0; i < 10; i++) {\n        if (!banner.parentElement || banner.parentElement === document.body) break;\n        banner = banner.parentElement;\n        if (/allow|permission/i.test(banner.textContent) && banner.querySelectorAll('button').length >= 1) break;\n      }\n      // Extract the options and buttons\n      const options = [];\n      banner.querySelectorAll('[role=\"radiogroup\"] label').forEach((el, i) => {\n        options.push({ index: i, label: (el.textContent || '').trim().substring(0, 80) });\n      });\n      const buttons = [];\n      let btnIdx = options.length;\n      banner.querySelectorAll('button').forEach(el => {\n        buttons.push({ index: btnIdx, label: (el.textContent || '').trim().substring(0, 50) });\n        btnIdx++;\n      });\n      const description = (banner.textContent || '').trim().substring(0, 300);\n      permissionBanner = { options, buttons, description };\n    }\n  } catch {}\n\n  return { html, css, agentRunning, proceedAvailable, proceedLabel, permissionBanner };\n})()\n";
var CdpPollingService = /** @class */ (function (_super) {
    __extends(CdpPollingService, _super);
    function CdpPollingService() {
        var _this = _super !== null && _super.apply(this, arguments) || this;
        _this.client = null;
        _this.timer = null;
        _this.lastHash = null;
        _this.cachedSnapshot = null;
        return _this;
    }
    CdpPollingService.prototype.getCdpPort = function () {
        return db_js_1.dbService.getSetting('antigravity_port') || '9000';
    };
    CdpPollingService.prototype.getCdpUrl = function () {
        return "http://127.0.0.1:".concat(this.getCdpPort());
    };
    CdpPollingService.prototype.getSessions = function () {
        return __awaiter(this, void 0, void 0, function () {
            var res, list, _a;
            return __generator(this, function (_b) {
                switch (_b.label) {
                    case 0:
                        _b.trys.push([0, 3, , 4]);
                        return [4 /*yield*/, fetch("".concat(this.getCdpUrl(), "/json/list"))];
                    case 1:
                        res = _b.sent();
                        if (!res.ok)
                            return [2 /*return*/, []];
                        return [4 /*yield*/, res.json()];
                    case 2:
                        list = (_b.sent());
                        return [2 /*return*/, list.filter(function (item) { return item.type === 'page'; })];
                    case 3:
                        _a = _b.sent();
                        return [2 /*return*/, []];
                    case 4: return [2 /*return*/];
                }
            });
        });
    };
    CdpPollingService.prototype.createSession = function (workspacePath) {
        return __awaiter(this, void 0, void 0, function () {
            var active, targetUrl, originalUrl, parsed, query, cdpTargetUrl, res, data, err_1;
            return __generator(this, function (_a) {
                switch (_a.label) {
                    case 0:
                        _a.trys.push([0, 4, , 5]);
                        return [4 /*yield*/, this.getSessions()];
                    case 1:
                        active = _a.sent();
                        targetUrl = '';
                        if (active.length > 0 && active[0].devtoolsFrontendUrl) {
                            originalUrl = active[0].url || '';
                            if (originalUrl) {
                                parsed = new URL(originalUrl);
                                targetUrl = "".concat(parsed.protocol, "//").concat(parsed.host, "/c/new");
                            }
                        }
                        if (!targetUrl) {
                            targetUrl = 'https://127.0.0.1:41141/c/new';
                        }
                        query = workspacePath ? "?workspace=".concat(encodeURIComponent(workspacePath)) : '';
                        cdpTargetUrl = "".concat(targetUrl).concat(query);
                        return [4 /*yield*/, fetch("".concat(this.getCdpUrl(), "/json/new?").concat(encodeURIComponent(cdpTargetUrl)), { method: 'PUT' })];
                    case 2:
                        res = _a.sent();
                        if (!res.ok) {
                            return [2 /*return*/, { ok: false, error: "CDP returned status ".concat(res.status) }];
                        }
                        return [4 /*yield*/, res.json()];
                    case 3:
                        data = (_a.sent());
                        return [2 /*return*/, { ok: true, sessionId: data.id }];
                    case 4:
                        err_1 = _a.sent();
                        return [2 /*return*/, { ok: false, error: err_1.message || 'Failed to connect to CDP' }];
                    case 5: return [2 /*return*/];
                }
            });
        });
    };
    CdpPollingService.prototype.hashString = function (str) {
        return crypto_1.default.createHash('sha256').update(str).digest('hex');
    };
    CdpPollingService.prototype.captureSnapshot = function () {
        return __awaiter(this, void 0, void 0, function () {
            var _a, result, exceptionDetails, e_1;
            return __generator(this, function (_b) {
                switch (_b.label) {
                    case 0:
                        if (!this.client)
                            return [2 /*return*/, null];
                        _b.label = 1;
                    case 1:
                        _b.trys.push([1, 3, , 4]);
                        return [4 /*yield*/, this.client.Runtime.evaluate({
                                expression: CAPTURE_SCRIPT,
                                awaitPromise: true,
                                returnByValue: true,
                            })];
                    case 2:
                        _a = _b.sent(), result = _a.result, exceptionDetails = _a.exceptionDetails;
                        if (exceptionDetails || !result.value) {
                            return [2 /*return*/, null];
                        }
                        return [2 /*return*/, result.value];
                    case 3:
                        e_1 = _b.sent();
                        return [2 /*return*/, null];
                    case 4: return [2 /*return*/];
                }
            });
        });
    };
    CdpPollingService.prototype.poll = function () {
        return __awaiter(this, void 0, void 0, function () {
            var sessions, _a, e_2, snapshot, hash;
            var _this = this;
            var _b;
            return __generator(this, function (_c) {
                switch (_c.label) {
                    case 0:
                        if (!!this.client) return [3 /*break*/, 7];
                        _c.label = 1;
                    case 1:
                        _c.trys.push([1, 6, , 7]);
                        return [4 /*yield*/, this.getSessions()];
                    case 2:
                        sessions = _c.sent();
                        if (!(sessions.length > 0)) return [3 /*break*/, 5];
                        _a = this;
                        return [4 /*yield*/, (0, chrome_remote_interface_1.default)({ port: parseInt(this.getCdpPort()), target: sessions[0].id })];
                    case 3:
                        _a.client = _c.sent();
                        return [4 /*yield*/, this.client.Runtime.enable()];
                    case 4:
                        _c.sent();
                        this.client.on('disconnect', function () {
                            _this.client = null;
                        });
                        _c.label = 5;
                    case 5: return [3 /*break*/, 7];
                    case 6:
                        e_2 = _c.sent();
                        return [3 /*break*/, 7];
                    case 7:
                        if (!this.client) return [3 /*break*/, 9];
                        return [4 /*yield*/, this.captureSnapshot()];
                    case 8:
                        snapshot = _c.sent();
                        if (snapshot) {
                            hash = this.hashString(snapshot.html + snapshot.css);
                            if (hash !== this.lastHash) {
                                snapshot.hash = hash;
                                snapshot.timestamp = new Date().toISOString();
                                this.cachedSnapshot = snapshot;
                                this.lastHash = hash;
                                this.emit('snapshot', snapshot);
                            }
                            else if (snapshot.agentRunning !== ((_b = this.cachedSnapshot) === null || _b === void 0 ? void 0 : _b.agentRunning)) {
                                if (this.cachedSnapshot) {
                                    this.cachedSnapshot.agentRunning = snapshot.agentRunning;
                                }
                                this.emit('status', { agentRunning: snapshot.agentRunning });
                            }
                        }
                        _c.label = 9;
                    case 9:
                        this.timer = setTimeout(function () { return _this.poll(); }, 500);
                        return [2 /*return*/];
                }
            });
        });
    };
    CdpPollingService.prototype.startPolling = function () {
        if (!this.timer) {
            this.poll();
        }
    };
    CdpPollingService.prototype.uploadImage = function (base64, mimetype, filename) {
        return __awaiter(this, void 0, void 0, function () {
            var safeBase64, safeMimetype, safeFileName, expression, _a, result, exceptionDetails, err_2;
            var _b;
            return __generator(this, function (_c) {
                switch (_c.label) {
                    case 0:
                        if (!this.client)
                            return [2 /*return*/, { ok: false, reason: 'no_cdp_client' }];
                        safeBase64 = JSON.stringify(base64);
                        safeMimetype = JSON.stringify(mimetype);
                        safeFileName = JSON.stringify(filename);
                        expression = "\n      (async () => {\n        const base64 = ".concat(safeBase64, ";\n        const mimetype = ").concat(safeMimetype, ";\n        const fileName = ").concat(safeFileName, ";\n\n        const binaryStr = atob(base64);\n        const bytes = new Uint8Array(binaryStr.length);\n        for (let i = 0; i < binaryStr.length; i++) {\n          bytes[i] = binaryStr.charCodeAt(i);\n        }\n\n        const file = new File([bytes], fileName, { type: mimetype });\n\n        const editorCandidates = document.querySelectorAll(\n          '[data-lexical-editor=\"true\"], [contenteditable=\"true\"][role=\"textbox\"], [contenteditable=\"true\"]'\n        );\n        let editor = null;\n        for (const el of editorCandidates) {\n          if (el.offsetParent !== null) editor = el;\n        }\n        if (!editor) return { ok: false, reason: 'no_editor' };\n\n        const dt = new DataTransfer();\n        dt.items.add(file);\n\n        editor.dispatchEvent(new DragEvent('dragenter', { dataTransfer: dt, bubbles: true }));\n        editor.dispatchEvent(new DragEvent('dragover', { dataTransfer: dt, bubbles: true, cancelable: true }));\n        editor.dispatchEvent(new DragEvent('drop', { dataTransfer: dt, bubbles: true, cancelable: true }));\n\n        return { ok: true };\n      })()\n    ");
                        _c.label = 1;
                    case 1:
                        _c.trys.push([1, 3, , 4]);
                        return [4 /*yield*/, this.client.Runtime.evaluate({
                                expression: expression,
                                awaitPromise: true,
                                returnByValue: true,
                            })];
                    case 2:
                        _a = _c.sent(), result = _a.result, exceptionDetails = _a.exceptionDetails;
                        if (exceptionDetails) {
                            return [2 /*return*/, { ok: false, reason: ((_b = exceptionDetails.exception) === null || _b === void 0 ? void 0 : _b.description) || 'evaluation_error' }];
                        }
                        return [2 /*return*/, result.value];
                    case 3:
                        err_2 = _c.sent();
                        return [2 /*return*/, { ok: false, reason: err_2.message }];
                    case 4: return [2 /*return*/];
                }
            });
        });
    };
    CdpPollingService.prototype.clickProceed = function () {
        return __awaiter(this, void 0, void 0, function () {
            var expression, _a, result, exceptionDetails, err_3;
            var _b;
            return __generator(this, function (_c) {
                switch (_c.label) {
                    case 0:
                        if (!this.client)
                            return [2 /*return*/, { ok: false, reason: 'no_cdp_client' }];
                        expression = "\n      (async () => {\n        // Try text-based \"Proceed\" button first\n        const allBtns = Array.from(document.querySelectorAll('button'));\n        for (const btn of allBtns) {\n          const text = (btn.textContent || '').trim();\n          if (/^Proceed$/i.test(text) && btn.offsetParent !== null) {\n            btn.click();\n            return { ok: true, clicked: text };\n          }\n        }\n        // Try play-triangle SVG button\n        const playSvg = document.querySelector('button svg.lucide-play');\n        if (playSvg) {\n          const btn = playSvg.closest('button');\n          if (btn && btn.offsetParent !== null) {\n            btn.click();\n            return { ok: true, clicked: 'play-icon' };\n          }\n        }\n        return { ok: false, reason: 'no_proceed_button' };\n      })()\n    ";
                        _c.label = 1;
                    case 1:
                        _c.trys.push([1, 3, , 4]);
                        return [4 /*yield*/, this.client.Runtime.evaluate({
                                expression: expression,
                                awaitPromise: true,
                                returnByValue: true,
                            })];
                    case 2:
                        _a = _c.sent(), result = _a.result, exceptionDetails = _a.exceptionDetails;
                        if (exceptionDetails) {
                            return [2 /*return*/, { ok: false, reason: ((_b = exceptionDetails.exception) === null || _b === void 0 ? void 0 : _b.description) || 'evaluation_error' }];
                        }
                        return [2 /*return*/, result.value];
                    case 3:
                        err_3 = _c.sent();
                        return [2 /*return*/, { ok: false, reason: err_3.message }];
                    case 4: return [2 /*return*/];
                }
            });
        });
    };
    CdpPollingService.prototype.clickPermission = function (index) {
        return __awaiter(this, void 0, void 0, function () {
            var safeIndex, expression, _a, result, exceptionDetails, err_4;
            var _b;
            return __generator(this, function (_c) {
                switch (_c.label) {
                    case 0:
                        if (!this.client)
                            return [2 /*return*/, { ok: false, reason: 'no_cdp_client' }];
                        safeIndex = JSON.stringify(index);
                        expression = "\n      (async () => {\n        const idx = ".concat(safeIndex, ";\n        const radioGroup = document.querySelector('[role=\"radiogroup\"]');\n        if (!radioGroup) return { ok: false, reason: 'no_radiogroup' };\n\n        let banner = radioGroup;\n        for (let i = 0; i < 10; i++) {\n          if (!banner.parentElement || banner.parentElement === document.body) break;\n          banner = banner.parentElement;\n          if (/allow|permission/i.test(banner.textContent) && banner.querySelectorAll('button').length >= 1) break;\n        }\n\n        const elements = [];\n        banner.querySelectorAll('[role=\"radiogroup\"] label').forEach(el => elements.push(el));\n        banner.querySelectorAll('button').forEach(el => elements.push(el));\n\n        if (idx >= 0 && idx < elements.length) {\n          const target = elements[idx];\n          const label = (target.textContent || '').trim().substring(0, 50);\n          target.click();\n          return { ok: true, label };\n        }\n        return { ok: false, reason: 'index_out_of_range', total: elements.length };\n      })()\n    ");
                        _c.label = 1;
                    case 1:
                        _c.trys.push([1, 3, , 4]);
                        return [4 /*yield*/, this.client.Runtime.evaluate({
                                expression: expression,
                                awaitPromise: true,
                                returnByValue: true,
                            })];
                    case 2:
                        _a = _c.sent(), result = _a.result, exceptionDetails = _a.exceptionDetails;
                        if (exceptionDetails) {
                            return [2 /*return*/, { ok: false, reason: ((_b = exceptionDetails.exception) === null || _b === void 0 ? void 0 : _b.description) || 'evaluation_error' }];
                        }
                        return [2 /*return*/, result.value];
                    case 3:
                        err_4 = _c.sent();
                        return [2 /*return*/, { ok: false, reason: err_4.message }];
                    case 4: return [2 /*return*/];
                }
            });
        });
    };
    CdpPollingService.prototype.getCachedSnapshot = function () {
        return this.cachedSnapshot;
    };
    return CdpPollingService;
}(events_1.EventEmitter));
exports.cdpService = new CdpPollingService();
exports.cdpService.startPolling();
