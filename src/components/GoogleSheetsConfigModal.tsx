import React, { useState } from 'react';
import { X, FileSpreadsheet, Key, HelpCircle, Code, Settings, Globe, CheckCircle2, ChevronRight, Copy } from 'lucide-react';
import { GoogleSheetConfig, saveGoogleSheetConfig } from '../utils/googleSheetHelper';

interface GoogleSheetsConfigModalProps {
  config: GoogleSheetConfig;
  accessToken: string | null;
  onClose: () => void;
  onSaveConfig: (newConfig: GoogleSheetConfig) => void;
  onTriggerLogin: (clientId: string) => void;
  onLogoutGoogle: () => void;
}

export default function GoogleSheetsConfigModal({
  config,
  accessToken,
  onClose,
  onSaveConfig,
  onTriggerLogin,
  onLogoutGoogle,
}: GoogleSheetsConfigModalProps) {
  const [syncMode, setSyncMode] = useState<'appsScript' | 'directApi'>(config.syncMode);
  const [spreadsheetId, setSpreadsheetId] = useState(config.spreadsheetId);
  const [sheetName, setSheetName] = useState(config.sheetName || 'Sheet1');
  const [appsScriptUrl, setAppsScriptUrl] = useState(config.appsScriptUrl);
  const [clientId, setClientId] = useState(localStorage.getItem('google_sheets_client_id') || '');
  const [autoSync, setAutoSync] = useState(config.autoSync);
  const [copied, setCopied] = useState(false);

  const scriptCode = `function doPost(e) {
  try {
    var payload = JSON.parse(e.postData.contents);
    var ssId = payload.spreadsheetId;
    var ss = ssId ? SpreadsheetApp.openById(ssId) : SpreadsheetApp.getActiveSpreadsheet();
    var sheetName = payload.sheetName || "Sheet1";
    var sheet = ss.getSheetByName(sheetName);
    if (!sheet) {
      sheet = ss.insertSheet(sheetName);
    }
    
    // 如果无数据，自动写入标准的入库明细列标题并美化
    if (sheet.getLastRow() === 0) {
      sheet.appendRow([
        "入库日期", "供应商", "物料编码", "物料名称", "规格型号", 
        "单位", "数量", "不含税单价", "不含税金额", "税前总价", 
        "7%税额", "含税金额"
      ]);
      sheet.getRange(1, 1, 1, 12).setFontWeight("bold").setBackground("#F1F5F9");
    }
    
    var rows = payload.rows;
    if (rows && rows.length) {
      var startRow = sheet.getLastRow() + 1;
      for (var i = 0; i < rows.length; i++) {
        sheet.appendRow(rows[i]);
      }
      var endRow = sheet.getLastRow();
      
      if (endRow >= startRow) {
        var lastCol = Math.max(12, sheet.getLastColumn());
        var rangeToLine = sheet.getRange(endRow, 1, 1, lastCol);
        // setBorder(top, left, bottom, right, vertical, horizontal, color, style)
        // 每一个登记的验收单据下方，在最后一行物料下绘制一条优雅的黑色下边框作为单据底部分割线
        rangeToLine.setBorder(null, null, true, null, null, null, "#000000", SpreadsheetApp.BorderStyle.SOLID_MEDIUM);
      }
    }
    return ContentService.createTextOutput(JSON.stringify({ success: true, count: rows.length }))
      .setMimeType(ContentService.MimeType.JSON);
  } catch (err) {
    return ContentService.createTextOutput(JSON.stringify({ success: false, error: err.toString() }))
      .setMimeType(ContentService.MimeType.JSON);
  }
}

function doGet(e) {
  try {
    var ssId = e && e.parameter && e.parameter.spreadsheetId;
    var ss = ssId ? SpreadsheetApp.openById(ssId) : SpreadsheetApp.getActiveSpreadsheet();
    var sheetName = (e && e.parameter && e.parameter.sheetName) || "Sheet1";
    var sheet = ss.getSheetByName(sheetName);
    if (!sheet) {
      return ContentService.createTextOutput(JSON.stringify({ success: true, rows: [] }))
        .setMimeType(ContentService.MimeType.JSON);
    }
    var rows = sheet.getDataRange().getValues();
    return ContentService.createTextOutput(JSON.stringify({ success: true, rows: rows }))
        .setMimeType(ContentService.MimeType.JSON);
  } catch (err) {
    return ContentService.createTextOutput(JSON.stringify({ success: false, error: err.toString() }))
        .setMimeType(ContentService.MimeType.JSON);
  }
}`;

  const handleCopyCode = () => {
    navigator.clipboard.writeText(scriptCode);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const handleSave = () => {
    const updatedConfig: GoogleSheetConfig = {
      syncMode,
      spreadsheetId: spreadsheetId.trim(),
      sheetName: sheetName.trim() || 'Sheet1',
      appsScriptUrl: appsScriptUrl.trim(),
      autoSync
    };
    if (clientId) {
      localStorage.setItem('google_sheets_client_id', clientId.trim());
    } else {
      localStorage.removeItem('google_sheets_client_id');
    }
    onSaveConfig(updatedConfig);
  };

  return (
    <div className="fixed inset-0 bg-gray-900/65 backdrop-blur-xs flex items-center justify-center p-4 z-50 animate-fade-in" id="google-sheets-config">
      <div className="bg-white rounded-2xl shadow-xl w-full max-w-2xl overflow-hidden flex flex-col max-h-[85vh]">
        
        {/* Header */}
        <div className="p-5 border-b border-gray-100 flex items-center justify-between bg-emerald-50/25">
          <div className="flex items-center gap-2">
            <div className="p-2 bg-emerald-500 rounded-lg text-white">
              <FileSpreadsheet size={18} />
            </div>
            <div>
              <h3 className="font-extrabold text-sm text-gray-900">Google Sheets 实时同步登记设置</h3>
              <p className="text-[11px] text-gray-400 mt-0.5">配置完成后，系统每次录入单据会自动将物料行上传并登记到您自己的 Google 表格中。</p>
            </div>
          </div>
          <button onClick={onClose} className="p-1.5 rounded-lg text-gray-400 hover:text-gray-500 hover:bg-gray-100 transition-colors">
            <X size={18} />
          </button>
        </div>

        {/* Scrollable Contents */}
        <div className="p-6 overflow-y-auto space-y-5 text-xs text-gray-700 flex-1">
          
          {/* Main Sync Mode Toggles */}
          <div className="space-y-1.5">
            <label className="text-[11px] font-bold text-gray-500 uppercase tracking-wider">选择连接架构方式</label>
            <div className="grid grid-cols-2 gap-2 bg-gray-100 p-0.5 rounded-xl font-semibold">
              <button
                type="button"
                onClick={() => setSyncMode('appsScript')}
                className={`py-2 text-center rounded-lg flex items-center justify-center gap-1.5 ${
                  syncMode === 'appsScript' ? 'bg-white shadow-xs text-emerald-800' : 'text-gray-500 hover:text-gray-800'
                }`}
              >
                <Globe size={13} className="text-emerald-500" />
                <span>Apps Script 脚本 (极简推荐)</span>
              </button>
              <button
                type="button"
                onClick={() => setSyncMode('directApi')}
                className={`py-2 text-center rounded-lg flex items-center justify-center gap-1.5 ${
                  syncMode === 'directApi' ? 'bg-white shadow-xs text-emerald-800' : 'text-gray-500 hover:text-gray-800'
                }`}
              >
                <Key size={13} className="text-indigo-500" />
                <span>直接 API 读写 (OAuth2 开发版)</span>
              </button>
            </div>
          </div>

          {/* Mode Guides */}
          {syncMode === 'appsScript' ? (
            <div className="bg-emerald-50/50 border border-emerald-100 rounded-xl p-4 space-y-3">
              <div className="flex items-start gap-2 text-emerald-900">
                <HelpCircle size={15} className="shrink-0 mt-0.5" />
                <div>
                  <p className="font-bold text-[12px]">Apps Script 优点：</p>
                  <p className="mt-0.5 leading-relaxed font-medium">
                    无需任何 Google Cloud 高级开发者凭证，不受沙箱 iframe 弹窗约束。任何普通的 Google Sheets 只要简单复制粘贴脚本代码并部署，即可 100% 成功跨域登记！
                  </p>
                </div>
              </div>

              {/* Step instructions */}
              <div className="space-y-2 text-[11px] text-gray-650 font-medium">
                <p className="font-bold text-gray-800">🛠️ 15秒配置流程：</p>
                <ul className="list-decimal pl-4 space-y-1.5 leading-relaxed">
                  <li>打开您的 Google 电子表格，点击顶部菜单的 <b className="text-gray-800">“扩展程序” ➔ “Apps Script”</b>。</li>
                  <li>清空里面的默认代码，直接将下方代码库复制并粘贴进去。</li>
                  <li>点击上方“磁盘图标”保存，然后点击右上角 <b className="text-emerald-700">“部署” ➔ “新建部署”</b>。</li>
                  <li>选择类型为 <b className="text-indigo-700">“网页应用” (Web App)</b>，并将 <b>“谁可以访问”</b> 选项改为 <b className="text-red-700">“任何人”</b>，点击部署。</li>
                  <li>点击授权并同意权限，复制部署得到的 <b className="text-gray-800">“网页应用部署 URL”</b>（以 <code className="bg-gray-100 p-0.5 rounded font-mono text-[10px]">https://script.google.com/</code> 开头），粘贴进下方配置项。</li>
                </ul>
              </div>

              {/* Code copier */}
              <div className="space-y-1.5">
                <div className="flex items-center justify-between">
                  <span className="text-[11px] font-bold text-gray-500 flex items-center gap-1 font-mono">
                    <Code size={12} />
                    APPS_SCRIPT.JS (点击复制)
                  </span>
                  <button
                    onClick={handleCopyCode}
                    className="flex items-center gap-1 text-[10px] text-white bg-emerald-600 hover:bg-emerald-700 rounded p-1 px-2.5 font-bold transition-all shadow-xs"
                  >
                    {copied ? <CheckCircle2 size={10} /> : <Copy size={10} />}
                    <span>{copied ? '已复制！' : '复制代码'}</span>
                  </button>
                </div>
                <pre className="p-3 bg-neutral-900 text-neutral-200 rounded-lg overflow-x-auto text-[10px] font-mono leading-relaxed max-h-[140px]">
                  {scriptCode}
                </pre>
              </div>
            </div>
          ) : (
            <div className="bg-indigo-50/50 border border-indigo-100 rounded-xl p-4 space-y-3">
              <div className="flex items-start gap-2 text-indigo-900">
                <HelpCircle size={15} className="shrink-0 mt-0.5" />
                <div>
                  <p className="font-bold text-[12px]">Direct API 优点：</p>
                  <p className="mt-0.5 leading-relaxed font-semibold text-indigo-950">
                    直接连线 Google API 服务网，使用您的 Web 客户端凭证进行 Google Auth2 授权。需要在 Google Developer Console 创建 Web Application 客户端。
                  </p>
                </div>
              </div>

              <div className="space-y-1.5 text-[11px] text-indigo-950 font-medium leading-relaxed">
                <p className="font-bold">🔑 OAuth 客户端凭据配置方法：</p>
                <ol className="list-decimal pl-4 space-y-1">
                  <li>打开 Google Cloud Console，进入 API 与服务控制台启用 Google Sheets API。</li>
                  <li>创建 Web Application 的 OAuth 2.0 客户端 ID。</li>
                  <li><b>已授权的 JavaScript 来源</b> 及 <b>重定向 URI</b> 请填写：
                      <p className="font-mono bg-white inline-block p-1 px-1.5 border border-indigo-200 rounded text-xs mt-1 text-slate-800">
                        {window.location.origin}
                      </p>
                  </li>
                  <li>在此下方填入您的客户端 ID，即可进行 Google 登录认证。</li>
                </ol>
              </div>

              {/* Direct Login Controls */}
              <div className="bg-white border border-indigo-150 p-4 rounded-xl space-y-3">
                <div className="flex flex-col">
                  <label className="text-[10px] font-semibold text-gray-500 mb-1">
                    Google OAuth2 客户端 ID (Client ID)
                  </label>
                  <input
                    type="text"
                    value={clientId}
                    onChange={(e) => setClientId(e.target.value)}
                    placeholder="984623034973-example.apps.googleusercontent.com"
                    className="border border-gray-200 p-2.5 rounded-lg text-xs font-mono"
                  />
                </div>

                <div className="flex items-center justify-between border-t border-gray-100 pt-3">
                  <div>
                    <p className="text-[11px] font-bold text-gray-800">Google 认证状态</p>
                    <p className="text-[10px] text-gray-400 mt-0.5">
                      {accessToken ? (
                        <span className="text-emerald-600 font-bold flex items-center gap-1">
                          ● 已成功登录 (含有 Sheets 读写令牌)
                        </span>
                      ) : (
                        <span className="text-gray-400 font-medium">● 未登录，请先输入客户端 ID 后授权</span>
                      )}
                    </p>
                  </div>
                  {accessToken ? (
                    <button
                      onClick={onLogoutGoogle}
                      className="text-xs font-bold text-rose-600 border border-rose-200 bg-rose-50/50 hover:bg-rose-50 px-3 py-1.5 rounded-lg transition-colors"
                    >
                      退出登录
                    </button>
                  ) : (
                    <button
                      onClick={() => onTriggerLogin(clientId)}
                      className="text-xs font-bold text-white bg-indigo-600 hover:bg-indigo-700 px-4 py-2 rounded-lg transition-all shadow-xs"
                      disabled={!clientId}
                    >
                      Sign in with Google
                    </button>
                  )}
                </div>
              </div>
            </div>
          )}

          {/* Core Configuration Fields */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4 pt-2 border-t border-gray-100">
            {/* Apps Script Url (Only if apps script selected) */}
            {syncMode === 'appsScript' && (
              <div className="flex flex-col md:col-span-2">
                <label className="text-[11px] font-bold text-gray-500 mb-1.5 flex items-center gap-1">
                  Apps Script 部署 URL *
                </label>
                <input
                  type="url"
                  value={appsScriptUrl}
                  onChange={(e) => setAppsScriptUrl(e.target.value)}
                  placeholder="https://script.google.com/macros/s/.../exec"
                  className="border border-gray-200 focus:border-emerald-500 outline-hidden p-2.5 rounded-xl text-xs font-mono"
                  required
                />
              </div>
            )}

            {/* Spreadsheet ID */}
            <div className="flex flex-col">
              <label className="text-[11px] font-bold text-gray-500 mb-1.5">
                Google 电子表格 ID (Spreadsheet ID)
              </label>
              <input
                type="text"
                value={spreadsheetId}
                onChange={(e) => setSpreadsheetId(e.target.value)}
                placeholder="例如: 1x8qYoDWhY3g_..."
                className="border border-gray-200 focus:border-emerald-500 outline-hidden p-2.5 rounded-xl text-xs font-mono"
              />
              <p className="text-[9px] text-gray-450 mt-1">
                此 ID 位于 Google Sheets URL 浏览器地址栏 <code className="bg-gray-100 select-all p-0.5 px-1 font-mono">/d/</code> 与 <code className="bg-gray-100 select-all p-0.5 px-1 font-mono">/edit</code> 之间。如果使用 Apps Script 且未关联特定其它 ID，可留空（对应脚本所绑定的当前表格）。
              </p>
            </div>

            {/* Sheet Sub-tab Name */}
            <div className="flex flex-col">
              <label className="text-[11px] font-bold text-gray-500 mb-1.5">
                记录工作表名称 (Sheet/Tab Name)
              </label>
              <input
                type="text"
                value={sheetName}
                onChange={(e) => setSheetName(e.target.value)}
                placeholder="例如: Sheet1"
                className="border border-gray-200 focus:border-emerald-500 outline-hidden p-2.5 rounded-xl text-xs font-semibold"
              />
              <p className="text-[9px] text-gray-450 mt-1">用于写入记录的工作表页签子命名。默认为 <code className="font-mono">Sheet1</code>。入库记录将直接在此标签下追加行记录。</p>
            </div>
          </div>

          {/* Auto-Sync Toggle */}
          <div className="bg-neutral-50 p-3 rounded-xl flex items-center justify-between border border-neutral-100">
            <div>
              <p className="font-bold text-gray-850">每次保存时自动同步</p>
              <p className="text-[10px] text-gray-400 mt-0.5">当您在系统核准并点击保存草稿或确认入库单时，自动实时将明细上传到 Google Sheet，告别手动导出。</p>
            </div>
            <label className="relative inline-flex items-center cursor-pointer">
              <input
                type="checkbox"
                checked={autoSync}
                onChange={(e) => setAutoSync(e.target.checked)}
                className="sr-only peer"
              />
              <div className="w-9 h-5 bg-gray-200 peer-focus:outline-hidden rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-4 after:w-4 after:transition-all peer-checked:bg-emerald-600"></div>
            </label>
          </div>

        </div>

        {/* Footer actions */}
        <div className="p-4 border-t border-gray-100 bg-gray-50 flex items-center justify-end gap-2 text-right">
          <button
            onClick={onClose}
            className="px-4 py-2 text-xs font-semibold text-gray-600 bg-white border border-gray-250 hover:bg-gray-50 rounded-xl transition-all"
          >
            取消关闭
          </button>
          <button
            onClick={handleSave}
            className="px-5 py-2 text-xs font-extrabold text-white bg-emerald-600 hover:bg-emerald-700 rounded-xl transition-all shadow-xs"
          >
            保存并开启实时登记
          </button>
        </div>

      </div>
    </div>
  );
}
