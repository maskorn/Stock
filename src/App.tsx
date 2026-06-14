import React, { useState, useEffect, useRef } from 'react';
import { 
  FileSpreadsheet, 
  UploadCloud, 
  Sparkles, 
  Trash2, 
  Plus, 
  FileText, 
  Settings, 
  RefreshCw, 
  CheckCircle, 
  AlertCircle,
  Copy,
  Info,
  ChevronDown,
  ChevronUp,
  CloudLightning,
  ExternalLink,
  Search,
  Download,
  CloudOff,
  Database,
  Calendar,
  Hash,
  User,
  Edit,
  Eye,
  X,
  ArrowRight,
  LayoutGrid,
  List,
  Camera
} from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';

// Types
import { ReceiptRecord, ReceiptItem } from './types';

// Google Sheets Sync Utilities
import {
  GoogleSheetConfig,
  getGoogleSheetConfig,
  saveGoogleSheetConfig,
  syncDirectToGoogleSheet,
  syncViaAppsScript,
  fetchRecordsFromGoogleSheet
} from './utils/googleSheetHelper';

import {
  exportReceiptsToExcel,
  downloadReceiptTemplate
} from './utils/excelHelper';

import { compressImage } from './utils/imageCompressor';

const generateId = () => Math.random().toString(36).substring(2, 9);

export default function App() {
  // Google Sheets state
  const [sheetConfig, setSheetConfig] = useState<GoogleSheetConfig>(() => getGoogleSheetConfig());
  const [showConfigPanel, setShowConfigPanel] = useState(false); // default collapsed as requested
  const [googleAccessToken, setGoogleAccessToken] = useState<string | null>(() => localStorage.getItem('google_sheets_access_token'));
  const [clientId, setClientId] = useState(localStorage.getItem('google_sheets_client_id') || '');
  
  // OCR processing state
  const [isParsing, setIsParsing] = useState(false);
  const [parserError, setParserError] = useState<string | null>(null);
  const [loaderStep, setLoaderStep] = useState(0);
  
  // Active review state (once parsed, they edit/preview here)
  const [activeDraft, setActiveDraft] = useState<ReceiptRecord | null>(null);
  const [parsedDraftQueue, setParsedDraftQueue] = useState<ReceiptRecord[]>([]);
  const [originalQueueLength, setOriginalQueueLength] = useState(0);
  const [isSyncingSheet, setIsSyncingSheet] = useState(false);
  const [copiedCode, setCopiedCode] = useState(false);

  // Local ledger records
  const [localReceipts, setLocalReceipts] = useState<ReceiptRecord[]>(() => {
    const saved = localStorage.getItem('local_saved_receipts_v2');
    return saved ? JSON.parse(saved) : [];
  });

  // Selected receipt detailed view modal
  const [selectedRecordForDetail, setSelectedRecordForDetail] = useState<ReceiptRecord | null>(null);

  // Ledger query search
  const [searchQuery, setSearchQuery] = useState('');
  const [viewMode, setViewMode] = useState<'cards' | 'table'>('cards');
  const [confirmingDeleteId, setConfirmingDeleteId] = useState<string | null>(null);

  // States for synced Google Sheet records to display direct linkage
  const [sheetReceipts, setSheetReceipts] = useState<ReceiptRecord[]>([]);
  const [isFetchingSheet, setIsFetchingSheet] = useState(false);
  const [sheetFetchError, setSheetFetchError] = useState<string | null>(null);

  const filteredReceipts = sheetReceipts.filter((r) => {
    const q = searchQuery.toLowerCase().trim().replace('฿', '');
    if (!q) return true;
    
    const preTax = r.totalAmount;
    const postTax = r.totalAmount * 1.07;
    
    return (
      r.supplier.toLowerCase().includes(q) ||
      r.receiptNumber.toLowerCase().includes(q) ||
      (r.notes && r.notes.toLowerCase().includes(q)) ||
      r.items.some(it => 
        it.name.toLowerCase().includes(q) || 
        String(it.unitPrice).includes(q) || 
        it.unitPrice.toFixed(2).includes(q) ||
        String(it.totalPrice).includes(q) ||
        it.totalPrice.toFixed(2).includes(q)
      ) ||
      String(preTax).includes(q) ||
      preTax.toFixed(2).includes(q) ||
      String(postTax).includes(q) ||
      postTax.toFixed(2).includes(q)
    );
  });

  // Simple sync logs of local actions (keeps user assured things went to Sheet)
  const [localLogs, setLocalLogs] = useState<{ id: string; time: string; supplier: string; itemsCount: number; status: 'success' | 'failed'; message: string }[]>(() => {
    const saved = localStorage.getItem('google_sheets_sync_logs_v2');
    return saved ? JSON.parse(saved) : [];
  });

  // Notifications status toast
  const [toast, setToast] = useState<{ message: string; type: 'success' | 'error' } | null>(null);

  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const cameraInputRef = useRef<HTMLInputElement | null>(null);

  const loaderMessages = [
    "正在深度读取并解析 PDF 数字化文件...",
    "正在连同 Gemini 3.5 Flash 智能提取发货方及业务日期...",
    "正在通过多维表格算法识别物料代码、名称及不含税单价...",
    "正在对齐列位字段 (入库日期、供应商、物料编码)...",
    "正在完成终期校核，准备呈现到核准表格中..."
  ];

  // Rotate loading step messages for interactive elegance
  useEffect(() => {
    let interval: any;
    if (isParsing) {
      interval = setInterval(() => {
        setLoaderStep((prev) => (prev + 1) % loaderMessages.length);
      }, 2000);
    }
    return () => clearInterval(interval);
  }, [isParsing]);

  // Parse redirect token hashes from OAuth login redirects (Direct API)
  useEffect(() => {
    if (window.location.hash) {
      const hash = window.location.hash.substring(1);
      const params = new URLSearchParams(hash);
      const token = params.get('access_token');
      if (token) {
        setGoogleAccessToken(token);
        localStorage.setItem('google_sheets_access_token', token);
        window.history.replaceState(null, '', window.location.pathname);
        showToast('Google Sheets API 授权登录成功！', 'success');
      }
    }
  }, []);

  const showToast = (message: string, type: 'success' | 'error' = 'success') => {
    setToast({ message, type });
    setTimeout(() => setToast(null), 3500);
  };

  const addLocalSyncLog = (supplier: string, itemsCount: number, status: 'success' | 'failed', message: string) => {
    const newLog = {
      id: generateId(),
      time: new Date().toLocaleTimeString('zh-CN', { hour: '2-digit', minute: '2-digit', second: '2-digit' }),
      supplier,
      itemsCount,
      status,
      message
    };
    const updated = [newLog, ...localLogs].slice(0, 5); // Keep last 5 logs for clarity
    setLocalLogs(updated);
    localStorage.setItem('google_sheets_sync_logs_v2', JSON.stringify(updated));
  };

  // Convert files to base64 helper
  const fileToBase64 = (file: File): Promise<string> => {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.readAsDataURL(file);
      reader.onload = () => {
        const result = reader.result as string;
        const base64Data = result.split(',')[1];
        resolve(base64Data);
      };
      reader.onerror = error => reject(error);
    });
  };

  // Trigger file processing
  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (!files || files.length === 0) return;
    await processFile(files[0]);
  };

  const processFile = async (file: File) => {
    if (file.type !== 'application/pdf' && !file.type.startsWith('image/')) {
      showToast("格式不支持，请上传标准的 PDF 格式账单文件或图片文件", "error");
      return;
    }

    setIsParsing(true);
    setLoaderStep(0);
    setParserError(null);
    setActiveDraft(null);

    try {
      const compressed = await compressImage(file);
      
      const res = await fetch('/api/parse-receipt', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          imageBase64: compressed.base64,
          mimeType: compressed.mimeType
        })
      });

      const json = await res.json();
      if (!res.ok || !json.success) {
        throw new Error(json.error || "提取单据失败，请重试或更换文件。");
      }

      const parsedData = json.data;
      let rawLists: any[] = [];
      if (parsedData.receipts && Array.isArray(parsedData.receipts)) {
        rawLists = parsedData.receipts;
      } else if (parsedData.items) {
        // Fallback for single receipt shape
        rawLists = [parsedData];
      }

      if (rawLists.length === 0) {
        throw new Error("模型未能从单据中识别到任何货件明细或有效单据，请检查后重试。");
      }

      // Standardize each record in the list
      const records: ReceiptRecord[] = rawLists.map((raw) => {
        const itemsWithIds = (raw.items || []).map((item: any) => ({
          id: generateId(),
          code: item.code || '',
          name: item.name || '未知品名',
          specification: item.specification || '',
          quantity: Number(item.quantity) || 1,
          unit: item.unit || '件',
          unitPrice: Number(item.unitPrice) || 0,
          totalPrice: Number(item.totalPrice) || (Number(item.quantity) * Number(item.unitPrice)) || 0
        }));

        const totalAmount = itemsWithIds.reduce((sum: number, it: any) => sum + it.totalPrice, 0);

        return {
          id: generateId(),
          receiptNumber: raw.receiptNumber || `RK${new Date().toISOString().replace(/[-:T]/g, '').slice(0, 10)}${Math.floor(Math.random() * 90 + 10)}`,
          date: raw.date ? (raw.date.includes('T') ? raw.date.split('T')[0] : raw.date.substring(0, 10)) : new Date().toISOString().split('T')[0],
          supplier: raw.supplier || '未识别供应商',
          operator: raw.operator || '',
          notes: raw.notes || '',
          status: 'draft',
          items: itemsWithIds,
          totalAmount: Math.round(totalAmount * 100) / 100,
          createdAt: new Date().toISOString()
        };
      });

      // Save all drafted records into local ledger storage!
      setLocalReceipts((prev) => {
        // Avoid duplicate entries of same receipts in local list
        const filteredPrev = prev.filter(p => !records.some(r => r.receiptNumber === p.receiptNumber));
        const updated = [...records, ...filteredPrev];
        localStorage.setItem('local_saved_receipts_v2', JSON.stringify(updated));
        return updated;
      });

      // Active draft is set to the first parsed receipt for immediate UI preview and editing
      setParsedDraftQueue(records);
      setOriginalQueueLength(records.length);
      setActiveDraft(records[0]);

      if (records.length > 1) {
        showToast(`📑 合并 PDF 自动拆分成功！共 ${records.length} 笔独立单据，已开启弹窗进行逐一确认。`, "success");
      } else {
        showToast("PDF 智能解析成功，已开启弹窗进行核对", "success");
      }
    } catch (err: any) {
      console.error(err);
      setParserError(err.message || "请求服务器处理超时，请确认 API Key 配置正确。");
      showToast("解析发生异常", "error");
    } finally {
      setIsParsing(false);
    }
  };

  // Local ledger saving helper
  const saveToLocalLedger = (record: ReceiptRecord, isSynced: boolean) => {
    const recordToSave: ReceiptRecord = {
      ...record,
      status: isSynced ? 'completed' : 'draft', // completed = synced, draft = unsynced local backup
    };

    setLocalReceipts((prev) => {
      const idx = prev.findIndex(r => r.id === record.id || r.receiptNumber === record.receiptNumber);
      let updated;
      if (idx > -1) {
        updated = [...prev];
        updated[idx] = recordToSave;
      } else {
        updated = [recordToSave, ...prev];
      }
      localStorage.setItem('local_saved_receipts_v2', JSON.stringify(updated));
      return updated;
    });
  };

  // Save only to local database, bypassing Cloud sync
  const handleSaveToLocalOnly = () => {
    if (!activeDraft) return;
    saveToLocalLedger(activeDraft, false);
    showToast("✅ 已成功登记到本地账本！状态标记为 [待同步]", "success");
    addLocalSyncLog(activeDraft.supplier, activeDraft.items.length, 'success', `已在本地存盘（可稍后一键重试云端同步或直接导出 Excel）`);
    
    // Advance the queue
    const remaining = parsedDraftQueue.slice(1);
    setParsedDraftQueue(remaining);
    if (remaining.length > 0) {
      setActiveDraft(remaining[0]);
    } else {
      setActiveDraft(null);
    }
  };

  // Skip current draft
  const handleSkipCurrentDraft = () => {
    const remaining = parsedDraftQueue.slice(1);
    setParsedDraftQueue(remaining);
    if (remaining.length > 0) {
      setActiveDraft(remaining[0]);
      showToast("已跳过当前草稿", "success");
    } else {
      setActiveDraft(null);
      showToast("所有单据已核对完毕");
    }
  };

  // Discard remaining drafts
  const handleCancelAllDrafts = () => {
    if (window.confirm("确定要关闭窗口并放弃剩余的所有待登记草稿单据吗？")) {
      setParsedDraftQueue([]);
      setActiveDraft(null);
      showToast("已关闭核对区，待处理草稿清空");
    }
  };

  // Synchronize dynamic draft details to Google Sheet
  const handleUploadToGoogleSheets = async () => {
    if (!activeDraft) return;

    // Direct check of configuration values
    if (sheetConfig.syncMode === 'appsScript') {
      if (!sheetConfig.appsScriptUrl) {
        showToast('请在此页面顶部配置您的 Google Apps Script Web App 部署 URL！', 'error');
        return;
      }
    } else {
      if (!googleAccessToken) {
        showToast('您已选择直接 API 读写架构，请点击上方“Google 登录”完成授权认证！', 'error');
        return;
      }
    }

    setIsSyncingSheet(true);
    try {
      if (sheetConfig.syncMode === 'appsScript') {
        await syncViaAppsScript(sheetConfig, activeDraft);
        showToast(`⚡ 成功自动登记 ${activeDraft.items.length} 个入库货件到 Google Sheet！`, 'success');
        addLocalSyncLog(activeDraft.supplier, activeDraft.items.length, 'success', `成功向子表「${sheetConfig.sheetName || 'Sheet1'}」追加 ${activeDraft.items.length} 行数据`);
      } else {
        if (!googleAccessToken) throw new Error("授权缺失");
        await syncDirectToGoogleSheet(sheetConfig, googleAccessToken, activeDraft);
        showToast(`⚡ 直接 API 同步成功！写入 ${activeDraft.items.length} 条数据`, 'success');
        addLocalSyncLog(activeDraft.supplier, activeDraft.items.length, 'success', `通过 Google API 写入 ${activeDraft.items.length} 个商品`);
      }
      
      // Save locally as 'completed'
      saveToLocalLedger(activeDraft, true);
      showToast("物料数据已登记备份至云端。您可以继续核对下一张单据", "success");
      
      // Advance the queue
      const remaining = parsedDraftQueue.slice(1);
      setParsedDraftQueue(remaining);
      if (remaining.length > 0) {
        setActiveDraft(remaining[0]);
      } else {
        setActiveDraft(null);
      }

      // Trigger automatic background spreadsheet recheck
      setTimeout(() => {
        handleFetchSheetRecords(true);
      }, 1500);
    } catch (err: any) {
      console.error(err);
      
      // Auto save locally as Unsynced so the parser result is NEVER lost!
      saveToLocalLedger(activeDraft, false);
      showToast(`云同步失败：已安全存盘至「下方本地账本」，可在排查网络后一键重试。`, 'error');
      addLocalSyncLog(activeDraft.supplier, activeDraft.items.length, 'failed', `云写入未就绪: ${err.message || '450/401/403'}. 已在浏览器安全暂存盘。`);
      
      // Since it is saved locally, safely advance the queue
      const remaining = parsedDraftQueue.slice(1);
      setParsedDraftQueue(remaining);
      if (remaining.length > 0) {
        setActiveDraft(remaining[0]);
      } else {
        setActiveDraft(null);
      }
    } finally {
      setIsSyncingSheet(false);
    }
  };

  // Retry Cloud Synchronization for an Unsynced Record from history list
  const handleRetrySyncTable = async (recordToSync: ReceiptRecord) => {
    if (sheetConfig.syncMode === 'appsScript') {
      if (!sheetConfig.appsScriptUrl) {
        showToast('请在此页面顶部配置您的 Google Apps Script URL！', 'error');
        return;
      }
    } else {
      if (!googleAccessToken) {
        showToast('请在上方完成 Google 登录授权！', 'error');
        return;
      }
    }

    showToast(`正在重试单号 [${recordToSync.receiptNumber}] 写入 Google 电子表...`, 'success');
    try {
      if (sheetConfig.syncMode === 'appsScript') {
        await syncViaAppsScript(sheetConfig, recordToSync);
      } else {
        if (!googleAccessToken) throw new Error("授权缺失");
        await syncDirectToGoogleSheet(sheetConfig, googleAccessToken, recordToSync);
      }

      showToast(`⚡ 云同步成功！单号 [${recordToSync.receiptNumber}] 状态已更新`, 'success');
      addLocalSyncLog(recordToSync.supplier, recordToSync.items.length, 'success', `追补同步成功：单号「${recordToSync.receiptNumber}」成功登记入云表格`);

      // Mark as completed
      setLocalReceipts((prev) => {
        const updated = prev.map(r => r.id === recordToSync.id ? { ...r, status: 'completed' as const } : r);
        localStorage.setItem('local_saved_receipts_v2', JSON.stringify(updated));
        return updated;
      });

      // Reload live Google sheet entries
      setTimeout(() => {
        handleFetchSheetRecords(true);
      }, 1500);
    } catch (err: any) {
      console.error(err);
      showToast(`同步失败：${err.message || '450/401/403'}`, 'error');
    }
  };

  // Load past record back into active editor to edit values
  const handleLoadRecordToDraft = (record: ReceiptRecord) => {
    if (activeDraft) {
      if (!window.confirm("核对区内已有待登记的草稿单据，是否放弃它并重载该历史单据？")) {
        return;
      }
    }
    setParsedDraftQueue([record]);
    setOriginalQueueLength(1);
    setActiveDraft({ ...record });
    showToast(`单号 [${record.receiptNumber}] 已重载入核对弹窗中！`, 'success');
  };

  // Delete past record
  const handleDeleteRecord = (recordId: string) => {
    setLocalReceipts((prev) => {
      const updated = prev.filter(r => r.id !== recordId);
      localStorage.setItem('local_saved_receipts_v2', JSON.stringify(updated));
      return updated;
    });
    setConfirmingDeleteId(null);
    showToast("本地登记记录已删除", "success");
  };

  // Fetch records from Google Sheets
  const handleFetchSheetRecords = async (silent = false) => {
    if (!sheetConfig.spreadsheetId) {
      if (!silent) {
        showToast("未配置 Google Spreadsheet ID，请在设置面板中配置！", "error");
      }
      return;
    }
    if (sheetConfig.syncMode === 'appsScript' && !sheetConfig.appsScriptUrl) {
      if (!silent) {
        showToast("未配置 Apps Script 部署 URL，请在设置面板中配置！", "error");
      }
      return;
    }
    if (sheetConfig.syncMode === 'directApi' && !googleAccessToken) {
      if (!silent) {
        showToast("Google API 未授权，请点击上方 Google 登录授权！", "error");
      }
      return;
    }

    setIsFetchingSheet(true);
    setSheetFetchError(null);
    try {
      const records = await fetchRecordsFromGoogleSheet(sheetConfig, googleAccessToken);
      // reverse so newest entries are displayed first
      setSheetReceipts(records.reverse());
      if (!silent) {
        showToast(`⚡ 成功从 Google Sheet 同步读取了 ${records.length} 条登记记录！`, "success");
      }
    } catch (err: any) {
      console.error("Sheet loading error:", err);
      setSheetFetchError(err.message || "未能成功从云表格加载记录，请检查连接");
      if (!silent) {
        showToast(`从云表格加载数据失败: ${err.message || "请求未获允许"}`, "error");
      }
    } finally {
      setIsFetchingSheet(false);
    }
  };

  // Proactive automatic cloud loading synchronizer
  useEffect(() => {
    const hasAppsScript = sheetConfig.syncMode === 'appsScript' && sheetConfig.spreadsheetId && sheetConfig.appsScriptUrl;
    const hasDirectApi = sheetConfig.syncMode === 'directApi' && sheetConfig.spreadsheetId && googleAccessToken;
    if (hasAppsScript || hasDirectApi) {
      handleFetchSheetRecords(true);
    } else {
      // Configuration empty or not logged in, reset sheet receipts to show configuration hints
      setSheetReceipts([]);
    }
  }, [sheetConfig.syncMode, sheetConfig.spreadsheetId, sheetConfig.sheetName, sheetConfig.appsScriptUrl, googleAccessToken]);

  // Google Sheets configurations setup helper
  const handleSaveConfig = (e: React.FormEvent) => {
    e.preventDefault();
    saveGoogleSheetConfig(sheetConfig);
    showToast('Google Sheet 连接配置保存成功！系统会持续拉取。', 'success');
  };

  // Google OAuth2 auth trigger
  const handleTriggerGoogleOAuth = () => {
    if (!clientId) {
      showToast('请输入您的 Google OAuth2 客户端 ID (Client ID)', 'error');
      return;
    }
    localStorage.setItem('google_sheets_client_id', clientId.trim());
    const scopes = 'https://www.googleapis.com/auth/spreadsheets';
    const redirectUri = window.location.origin;
    const oauthUrl = `https://accounts.google.com/o/oauth2/v2/auth?client_id=${encodeURIComponent(clientId.trim())}&redirect_uri=${encodeURIComponent(redirectUri)}&response_type=token&scope=${encodeURIComponent(scopes)}&state=sheets`;
    window.location.href = oauthUrl;
  };

  const handleLogoutGoogle = () => {
    setGoogleAccessToken(null);
    localStorage.removeItem('google_sheets_access_token');
    showToast('已安全清除 Google Sheets API 会话凭证', 'success');
  };

  const appsScriptCode = `function doPost(e) {
  try {
    var payload = JSON.parse(e.postData.contents);
    var ssId = payload.spreadsheetId;
    var ss = ssId ? SpreadsheetApp.openById(ssId) : SpreadsheetApp.getActiveSpreadsheet();
    var sheetName = payload.sheetName || "Sheet1";
    var sheet = ss.getSheetByName(sheetName);
    if (!sheet) {
      sheet = ss.insertSheet(sheetName);
    }
    
    // 如果工作表是个新表/首行为空，自动附加规范列名
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
    navigator.clipboard.writeText(appsScriptCode);
    setCopiedCode(true);
    setTimeout(() => setCopiedCode(false), 2000);
    showToast('Apps Script 代码块已复制到剪贴板！', 'success');
  };

  // Editable row change handles
  const handleItemFieldChange = (itemId: string, field: keyof ReceiptItem, val: any) => {
    if (!activeDraft) return;

    const updatedItems = activeDraft.items.map(item => {
      if (item.id === itemId) {
        const itemCopy = { ...item, [field]: val };
        
        // Dynamic re-calculations
        if (field === 'quantity' || field === 'unitPrice') {
          const q = field === 'quantity' ? Number(val) : item.quantity;
          const p = field === 'unitPrice' ? Number(val) : item.unitPrice;
          itemCopy.totalPrice = Math.round((q * p) * 100) / 100;
        }
        return itemCopy;
      }
      return item;
    });

    const newTotal = updatedItems.reduce((sum, it) => sum + it.totalPrice, 0);

    setActiveDraft({
      ...activeDraft,
      items: updatedItems,
      totalAmount: Math.round(newTotal * 100) / 100
    });
  };

  const handleAddItemRow = () => {
    if (!activeDraft) return;
    const newItem: ReceiptItem = {
      id: generateId(),
      code: '',
      name: '',
      specification: '',
      quantity: 1,
      unit: '件',
      unitPrice: 0,
      totalPrice: 0
    };
    setActiveDraft({
      ...activeDraft,
      items: [...activeDraft.items, newItem]
    });
  };

  const handleRemoveItemRow = (itemId: string) => {
    if (!activeDraft) return;
    if (activeDraft.items.length <= 1) {
      showToast("货物明细列表至少要包含 1 个物料项", "error");
      return;
    }
    const filtered = activeDraft.items.filter(item => item.id !== itemId);
    const newTotal = filtered.reduce((sum, it) => sum + it.totalPrice, 0);
    setActiveDraft({
      ...activeDraft,
      items: filtered,
      totalAmount: Math.round(newTotal * 100) / 100
    });
  };

  // Drag over states
  const [dragOver, setDragOver] = useState(false);
  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    setDragOver(true);
  };
  const handleDragLeave = () => {
    setDragOver(false);
  };
  const handleDrop = async (e: React.DragEvent) => {
    e.preventDefault();
    setDragOver(false);
    const files = e.dataTransfer.files;
    if (files && files.length > 0) {
      await processFile(files[0]);
    }
  };

  // Dynamic calculated taxes of current draft
  const draftUntaxedTotal = activeDraft ? activeDraft.totalAmount : 0;
  const draftTax = Math.round((draftUntaxedTotal * 0.07) * 100) / 100;
  const draftTaxInclusive = Math.round((draftUntaxedTotal + draftTax) * 100) / 100;

  return (
    <div className="min-h-screen bg-slate-50 flex flex-col font-sans relative antialiased text-gray-800">
      
      {/* Toast Alert Notification */}
      <AnimatePresence>
        {toast && (
          <motion.div 
            initial={{ opacity: 0, y: -20, x: "-50%" }}
            animate={{ opacity: 1, y: 0, x: "-50%" }}
            exit={{ opacity: 0, y: -20, x: "-50%" }}
            className={`fixed top-4 left-1/2 px-5 py-3 rounded-xl shadow-lg z-50 flex items-center gap-2 border text-xs font-extrabold ${
              toast.type === 'success' 
                ? 'bg-emerald-50 text-emerald-900 border-emerald-200' 
                : 'bg-rose-50 text-rose-800 border-rose-200'
            }`}
          >
            <span>{toast.message}</span>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Modern High-End Top Dashboard Header */}
      <header className="bg-white border-b border-slate-200/85 sticky top-0 z-40">
        <div className="max-w-6xl mx-auto px-4 py-4 flex flex-col sm:flex-row items-center justify-between gap-4">
          <div className="flex items-center gap-2.5">
            <div className="p-2 bg-emerald-600 text-white rounded-xl shadow-xs">
              <FileSpreadsheet size={20} />
            </div>
            <div>
              <h1 className="text-base font-black text-slate-900 tracking-tight flex items-center gap-2">
                智能 PDF 物料验收登记器
                <span className="text-[10px] font-extrabold bg-emerald-50 border border-emerald-200 text-emerald-800 px-1.5 py-0.5 rounded-sm">
                  Google Sheet Pro
                </span>
              </h1>
              <p className="text-[10.5px] text-gray-400 mt-0.5">直接核验 PDF 入库并向 Google 电子表云表格追加登记行</p>
            </div>
          </div>

          <div className="hidden md:flex items-center gap-2">
            {/* Server configuration check badge */}
            <div className={`px-3 py-1.5 rounded-xl border text-[11px] font-bold flex items-center gap-1.5 ${
              (sheetConfig.syncMode === 'appsScript' ? sheetConfig.appsScriptUrl : googleAccessToken)
                ? 'bg-emerald-50 border-emerald-200 text-emerald-800'
                : 'bg-amber-50 border-amber-200 text-amber-800'
            }`}>
              <span className={`w-1.5 h-1.5 rounded-full ${
                (sheetConfig.syncMode === 'appsScript' ? sheetConfig.appsScriptUrl : googleAccessToken)
                  ? 'bg-emerald-500 animate-pulse'
                  : 'bg-amber-500'
              }`}></span>
              <span>
                {sheetConfig.syncMode === 'appsScript' 
                  ? (sheetConfig.appsScriptUrl ? 'Apps Script 连接就绪' : '未连接 Apps Script 脚本')
                  : (googleAccessToken ? 'Google API 授权已建立' : '暂无 API 授权')
                }
              </span>
            </div>

            <button
              onClick={() => setShowConfigPanel(!showConfigPanel)}
              className="p-1 px-2.5 text-xs text-slate-500 bg-slate-100/80 hover:bg-slate-100 rounded-lg border border-slate-200 hover:text-slate-800 font-bold flex items-center gap-1 transition-colors"
            >
              <Settings size={13} />
              <span>配置 Google 电子表</span>
              {showConfigPanel ? <ChevronUp size={12} /> : <ChevronDown size={12} />}
            </button>
          </div>
        </div>
      </header>

      {/* Main Single Screen Layout */}
      <main className="max-w-6xl mx-auto p-4 sm:p-6 w-full flex-1 space-y-6">

        {/* 1. Google Sheets Configuration Setup Card (Directly embedded on page) */}
        <AnimatePresence>
          {showConfigPanel && (
            <motion.div
              initial={{ opacity: 0, height: 0 }}
              animate={{ opacity: 1, height: 'auto' }}
              exit={{ opacity: 0, height: 0 }}
              className="overflow-hidden"
            >
              <div className="bg-white border border-slate-200/90 rounded-2xl shadow-xs p-5 space-y-5">
                <div className="flex items-center justify-between border-b border-slate-100 pb-3">
                  <div className="flex items-center gap-2">
                    <FileSpreadsheet className="text-emerald-600" size={18} />
                    <h2 className="text-xs font-bold uppercase tracking-wider text-slate-700">Google Sheets 连接与部署配置</h2>
                  </div>
                  <span className="text-[10px] text-gray-400 font-medium">配置项储存在您的本地浏览器中</span>
                </div>

                {/* Sub Architecture Mode Switches */}
                <div className="grid grid-cols-1 md:grid-cols-3 gap-6 text-xs text-slate-600 font-semibold">
                  
                  {/* Selector column */}
                  <div className="space-y-3 border-r border-slate-100 pr-0 md:pr-6">
                    <span className="text-[10.5px] font-bold text-gray-400 uppercase">1. 选择连接通信架构</span>
                    <div className="bg-slate-10 rounded-xl p-1 flex flex-col gap-1 border border-slate-200/60">
                      <button
                        type="button"
                        onClick={() => setSheetConfig({ ...sheetConfig, syncMode: 'appsScript' })}
                        className={`p-2 text-left px-3 rounded-lg flex items-center gap-2 ${
                          sheetConfig.syncMode === 'appsScript' ? 'bg-white shadow-xs text-emerald-800 font-bold' : 'text-gray-500 hover:text-slate-700'
                        }`}
                      >
                        <span className={`w-1.5 h-1.5 rounded-full ${sheetConfig.syncMode === 'appsScript' ? 'bg-emerald-500' : 'bg-transparent'}`}></span>
                        <span>Apps Script 部署脚本 (最省心推荐)</span>
                      </button>
                      <button
                        type="button"
                        onClick={() => setSheetConfig({ ...sheetConfig, syncMode: 'directApi' })}
                        className={`p-2 text-left px-3 rounded-lg flex items-center gap-2 ${
                          sheetConfig.syncMode === 'directApi' ? 'bg-white shadow-xs text-indigo-850 font-bold' : 'text-gray-500 hover:text-slate-700'
                        }`}
                      >
                        <span className={`w-1.5 h-1.5 rounded-full ${sheetConfig.syncMode === 'directApi' ? 'bg-indigo-500' : 'bg-transparent'}`}></span>
                        <span>直接 API 双向读写 (OAuth2 登录)</span>
                      </button>
                    </div>

                    <p className="text-[10.5px] text-gray-400 font-medium leading-relaxed">
                      {sheetConfig.syncMode === 'appsScript' 
                        ? "Apps Script 脚本可以通过极其简单的 POST 传输实时追加明细数据，绕过一切沙箱跨域以及繁琐的 Google 客户端凭证创建。"
                        : "直接 API 读写需要您在 Google Cloud 启用 Web Client ID 并进行授权登录，登录令牌将安全保存在浏览器本地。"
                      }
                    </p>
                  </div>

                  {/* Settings Input Form Column */}
                  <form onSubmit={handleSaveConfig} className="md:col-span-2 space-y-4">
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                      
                      {sheetConfig.syncMode === 'appsScript' ? (
                        /* Apps Script URL inputs */
                        <div className="flex flex-col sm:col-span-2">
                          <label className="text-[10.5px] font-bold text-gray-400 uppercase mb-1">
                            Google Apps Script 部署 URL *
                          </label>
                          <input
                            type="url"
                            value={sheetConfig.appsScriptUrl}
                            onChange={(e) => setSheetConfig({ ...sheetConfig, appsScriptUrl: e.target.value })}
                            placeholder="https://script.google.com/macros/s/AKfycb.../exec"
                            className="bg-slate-50 border border-slate-200 rounded-xl p-2.5 text-xs font-mono focus:bg-white focus:ring-1 focus:ring-emerald-200 outline-hidden focus:border-emerald-500"
                            required
                          />
                        </div>
                      ) : (
                        /* Direct Google Client ID input row */
                        <div className="flex flex-col sm:col-span-2 bg-slate-50 border border-slate-150 p-3 rounded-xl space-y-3.5">
                          <div className="flex flex-col">
                            <label className="text-[10px] font-bold text-indigo-950/60 uppercase mb-1">
                              Google Developer Client ID (OAuth 客户端 ID)
                            </label>
                            <input
                              type="text"
                              value={clientId}
                              onChange={(e) => setClientId(e.target.value)}
                              placeholder="984623034973-example.apps.googleusercontent.com"
                              className="bg-white border border-slate-200 rounded-lg p-2 font-mono text-[11px]"
                            />
                          </div>

                          <div className="flex items-center justify-between border-t border-slate-250/50 pt-2 text-xs">
                            <div className="flex items-center gap-1">
                              <span className={`w-1.5 h-1.5 rounded-full ${googleAccessToken ? 'bg-emerald-500' : 'bg-slate-350'}`}></span>
                              <span className="text-[10.5px] text-gray-500 font-bold">
                                {googleAccessToken ? 'Google API 已授权状态' : '未登录认证电子表'}
                              </span>
                            </div>

                            {googleAccessToken ? (
                              <button
                                type="button"
                                onClick={handleLogoutGoogle}
                                className="text-[10.5px] font-extrabold text-rose-600 hover:bg-rose-50 border border-rose-200 px-2.5 py-1 rounded-lg transition-colors"
                              >
                                退出 Google 登录
                              </button>
                            ) : (
                              <button
                                type="button"
                                onClick={handleTriggerGoogleOAuth}
                                className="text-[10.5px] font-extrabold text-white bg-indigo-600 hover:bg-indigo-700 px-3 py-1 rounded-lg shadow-xs"
                                disabled={!clientId}
                              >
                                登录授权此电子表
                              </button>
                            )}
                          </div>
                        </div>
                      )}

                      {/* Spreadsheet ID config */}
                      <div className="flex flex-col">
                        <label className="text-[10.5px] font-bold text-gray-400 uppercase mb-1">
                          Google 电子表格 ID (Spreadsheet ID)
                        </label>
                        <input
                          type="text"
                          value={sheetConfig.spreadsheetId}
                          onChange={(e) => setSheetConfig({ ...sheetConfig, spreadsheetId: e.target.value })}
                          placeholder="例如: 1x8qYoDWhY3g..."
                          className="bg-slate-50 border border-slate-200 rounded-xl p-2.5 text-xs font-mono focus:bg-white focus:border-emerald-500 focus:ring-1 focus:ring-emerald-100 outline-hidden"
                        />
                      </div>

                      {/* Sheet Name config */}
                      <div className="flex flex-col">
                        <label className="text-[10.5px] font-bold text-gray-400 uppercase mb-1">
                          记录工作表名称 (Sheet/Tab Name)
                        </label>
                        <input
                          type="text"
                          value={sheetConfig.sheetName}
                          onChange={(e) => setSheetConfig({ ...sheetConfig, sheetName: e.target.value })}
                          placeholder="例如: Sheet1"
                          className="bg-slate-50 border border-slate-200 rounded-xl p-2.5 text-xs font-bold focus:bg-white focus:border-emerald-500 outline-hidden"
                        />
                      </div>

                    </div>

                    <div className="flex flex-col sm:flex-row items-center justify-between gap-3 border-t border-slate-100 pt-3">
                      <div className="text-[10px] text-gray-400 flex items-center gap-1 font-medium">
                        <Info size={11} className="text-slate-400 shrink-0" />
                        <span>自动写入列名: 入库日期 | 供应商 | 物料编码 | 物料名称 | 规格型号 | 单位 | 数量 | 不含税单价 | 不含税金额 ...</span>
                      </div>
                      <button
                        type="submit"
                        className="w-full sm:w-auto bg-emerald-600 hover:bg-emerald-700 text-white font-extrabold text-xs py-2 px-5 rounded-xl shadow-xs transition-colors self-end shrink-0"
                      >
                        确认保存工作表配置
                      </button>
                    </div>
                  </form>
                </div>

                {/* Inline copy guide for Google Apps Script Code */}
                {sheetConfig.syncMode === 'appsScript' && (
                  <div className="bg-emerald-50/20 border border-emerald-100/60 p-3.5 rounded-xl space-y-2">
                    <p className="flex items-center justify-between text-xs text-emerald-900 font-bold">
                      <span className="flex items-center gap-1.5">
                        <CloudLightning size={13} className="text-emerald-600" />
                        <span>零成本 15秒部署：Google Apps Script 万能数据转接服务</span>
                      </span>
                      <button
                        type="button"
                        onClick={handleCopyCode}
                        className="text-[10px] bg-emerald-600 hover:bg-emerald-700 text-white font-extrabold px-2.5 py-1 rounded transition-colors flex items-center gap-1 cursor-pointer"
                      >
                        <Copy size={10} />
                        <span>{copiedCode ? '已复制代码' : '复制代码内容'}</span>
                      </button>
                    </p>
                    <p className="text-[10.5px] text-gray-500 leading-relaxed font-semibold">
                      在您的 Google 表格顶部点击 <b className="text-gray-700">“扩展程序” ➔ “Apps Script”</b>，清空后粘贴此代码，点击保存并选择 <b className="text-emerald-700">“部署” ➔ “新建部署”➔“网页应用”</b>。将 <b>“谁可以访问”</b> 改为 <b className="text-rose-700">“任何人”</b>。完成后复制得到的部署网页 API 网址粘入上方输入框即可。
                    </p>
                  </div>
                )}
              </div>
            </motion.div>
          )}
        </AnimatePresence>

        {/* 2. Primary Layout: Full Width Space */}
        <div className="space-y-6">

            {/* Drag & Drop File Container Zone */}
            <div
              onDragOver={handleDragOver}
              onDragLeave={handleDragLeave}
              onDrop={handleDrop}
              onClick={() => {
                if (window.innerWidth >= 768) {
                  fileInputRef.current?.click();
                }
              }}
              className={`border-2 border-dashed rounded-3xl p-6 sm:p-8 py-8 sm:py-10 transition-all flex flex-col items-center justify-center text-center cursor-pointer relative group overflow-hidden ${
                dragOver 
                  ? 'border-emerald-500 bg-emerald-50/10 shadow-inner' 
                  : 'border-slate-250 hover:border-emerald-450 bg-white hover:bg-slate-50/40 shadow-xs'
              }`}
              id="pdf-main-dropzone"
            >
              <input 
                type="file" 
                ref={fileInputRef} 
                onChange={handleFileChange} 
                className="hidden" 
                accept="application/pdf,image/*" 
              />

              <input 
                type="file" 
                ref={cameraInputRef} 
                onChange={handleFileChange} 
                className="hidden" 
                accept="image/*" 
                capture="environment" 
              />

              <div className="absolute inset-0 bg-[radial-gradient(circle_at_bottom_right,_var(--tw-gradient-stops))] from-slate-100/10 via-transparent to-transparent -z-10"></div>

              {/* DESKTOP INTEGRATED VIEW */}
              <div className="hidden md:flex flex-col items-center justify-center">
                <div className="p-4 bg-slate-50 group-hover:bg-emerald-50 border border-slate-100 group-hover:border-emerald-100 rounded-2xl text-slate-400 group-hover:text-emerald-700 transition-all mb-4 shadow-2xs">
                  <UploadCloud size={30} className="animate-bounce" />
                </div>

                <h3 className="text-sm font-bold text-slate-800 tracking-tight">
                  将入库发票 PDF 或商品清单图片拖放到此处
                </h3>
                <p className="text-xs text-gray-400 max-w-sm mx-auto leading-relaxed mt-1">
                  支持标准 PDF 发货明细文件、北新建材入库报告、材料单原件图片。AI 读件器将通过深度表格扫描精准剔除无用字段，保留高能字段对齐生成电子表格记录。
                </p>

                <div className="mt-4 flex flex-wrap justify-center gap-1.5">
                  <span className="text-[9.5px] font-bold bg-emerald-50 text-emerald-700 border border-emerald-150 px-2 py-0.5 rounded-md">
                    PDF
                  </span>
                  <span className="text-[9.5px] font-bold bg-blue-50 text-blue-700 border border-blue-150 px-2 py-0.5 rounded-md">
                    PNG
                  </span>
                  <span className="text-[9.5px] font-bold bg-purple-50 text-purple-700 border border-purple-150 px-2 py-0.5 rounded-md">
                    JPEG
                  </span>
                  <span className="text-[9.5px] font-bold bg-indigo-50 text-indigo-700 border border-indigo-150 px-2 py-0.5 rounded-md">
                    Gemini 3.5 Flash 
                  </span>
                </div>
              </div>

              {/* MOBILE STREAMLINED ACTIONS VIEW */}
              <div className="flex md:hidden flex-col items-center justify-center w-full space-y-4">
                <div className="text-center space-y-1 mb-2">
                  <h4 className="text-xs font-black text-slate-800 tracking-tight">
                    入库移动工作台
                  </h4>
                  <p className="text-[10px] text-gray-450 leading-relaxed max-w-xs mx-auto">
                    请选择以下操作上传或拍照录单，AI 将自动对账
                  </p>
                </div>

                <div className="grid grid-cols-2 gap-3.5 w-full">
                  {/* Action 1: Upload file/image */}
                  <button
                    type="button"
                    onClick={(e) => {
                      e.stopPropagation();
                      fileInputRef.current?.click();
                    }}
                    className="p-4 bg-emerald-50/60 hover:bg-emerald-50 border border-emerald-150 rounded-2xl flex flex-col items-center justify-center gap-2 transition-all text-emerald-900 active:scale-98 cursor-pointer"
                  >
                    <div className="p-2.5 bg-white text-emerald-600 rounded-xl shadow-2xs">
                      <UploadCloud size={22} />
                    </div>
                    <span className="text-[11px] font-black leading-none">上传 PDF/图片</span>
                  </button>

                  {/* Action 2: Direct Camera capture */}
                  <button
                    type="button"
                    onClick={(e) => {
                      e.stopPropagation();
                      cameraInputRef.current?.click();
                    }}
                    className="p-4 bg-indigo-50 hover:bg-indigo-100/80 border border-indigo-150 rounded-2xl flex flex-col items-center justify-center gap-2 transition-all text-indigo-900 active:scale-98 cursor-pointer"
                  >
                    <div className="p-2.5 bg-white text-indigo-600 rounded-xl shadow-2xs">
                      <Camera size={22} />
                    </div>
                    <span className="text-[11px] font-black leading-none">手机拍照功能</span>
                  </button>
                </div>
                
                <p className="text-[9.5px] text-gray-400 font-semibold pt-1">
                  💡 拍照时请保证单据文字清晰完整，光线充足
                </p>
              </div>
            </div>

            {/* Parser interactive state representation */}
            {isParsing && (
              <div className="bg-white border border-slate-200/90 rounded-2xl p-6 text-center space-y-4">
                <div className="relative w-12 h-12 mx-auto">
                  <div className="absolute inset-0 rounded-full border-4 border-emerald-100 animate-pulse"></div>
                  <div className="absolute inset-0 rounded-full border-4 border-t-emerald-600 animate-spin"></div>
                  <div className="absolute inset-0 flex items-center justify-center text-emerald-600">
                    <Sparkles size={16} className="animate-pulse" />
                  </div>
                </div>
                <div className="space-y-1">
                  <h4 className="text-xs font-bold text-slate-900 tracking-tight">AI 扫描分析大脑连线中...</h4>
                  <p className="text-xs text-emerald-800 font-semibold px-4 min-h-[35px] max-w-md mx-auto leading-relaxed">
                    {loaderMessages[loaderStep]}
                  </p>
                </div>
              </div>
            )}

            {/* Parser Error Block */}
            {parserError && (
              <div className="bg-rose-50 border border-rose-150 rounded-2xl p-4 flex items-start gap-2 text-rose-800 text-xs">
                <AlertCircle size={15} className="shrink-0 mt-0.5" />
                <div className="space-y-1">
                  <p className="font-bold">深度解析失败</p>
                  <p className="font-medium text-rose-700 leading-relaxed">{parserError}</p>
                </div>
              </div>
            )}

            {/* 3. Parsed Output Dynamic Review Modal popup */}
            <AnimatePresence>
              {activeDraft && (
                <div className="fixed inset-0 z-50 bg-slate-900/60 backdrop-blur-sm flex items-center justify-center p-3 sm:p-5 overflow-hidden" id="review-modal-portal">
                  <motion.div
                    initial={{ opacity: 0, scale: 0.96, y: 20 }}
                    animate={{ opacity: 1, scale: 1, y: 0 }}
                    exit={{ opacity: 0, scale: 0.96, y: 20 }}
                    transition={{ type: "spring", duration: 0.35 }}
                    className="bg-white border border-slate-200/95 rounded-3xl overflow-hidden shadow-2xl max-w-6xl w-full max-h-[92vh] flex flex-col"
                    id="review-modal-box"
                  >
                    
                    {/* Meta Header */}
                    <div className="p-4 sm:p-5 border-b border-slate-100 bg-slate-50/45 flex flex-col md:flex-row items-start md:items-center justify-between gap-4 shrink-0">
                      <div className="flex items-center gap-2.5">
                        <div className="p-2 bg-emerald-600 rounded-xl text-white shadow-xs">
                          <FileText size={16} />
                        </div>
                        <div>
                          <h3 className="font-extrabold text-[13px] text-slate-900 flex items-center gap-2 leading-none">
                            <span>请仔细核对识别出的账单物料：</span>
                            {originalQueueLength > 1 && (
                              <span className="text-[10px] font-black bg-emerald-50 text-emerald-800 border border-emerald-150 px-2 py-0.5 rounded-full animate-pulse flex items-center gap-1">
                                <Sparkles size={8} className="text-emerald-600" />
                                进度: {originalQueueLength - parsedDraftQueue.length + 1} / {originalQueueLength}
                              </span>
                            )}
                          </h3>
                          <p className="text-[10px] text-gray-400 mt-1.5 font-medium">如有任何细微误判或数量差异，可直接在下表中手工涂改，完成后点击确认登记入库。</p>
                        </div>
                      </div>

                      <div className="flex flex-wrap items-center gap-2 w-full md:w-auto shrink-0 justify-end">
                        {parsedDraftQueue.length > 1 && (
                          <button
                            onClick={handleSkipCurrentDraft}
                            className="flex-1 md:flex-none p-2 px-3 text-xs bg-amber-50 hover:bg-amber-100 text-amber-800 rounded-xl transition-colors font-bold border border-amber-200 cursor-pointer flex items-center gap-1 justify-center whitespace-nowrap"
                            title="跳过当前单据直接核对下一张单据"
                          >
                            <ArrowRight size={12} className="text-amber-700" />
                            <span>跳过此单</span>
                          </button>
                        )}

                        <button
                          onClick={handleCancelAllDrafts}
                          className="flex-1 md:flex-none p-2 px-3 text-xs bg-slate-50 hover:bg-rose-50 hover:text-rose-600 rounded-xl transition-colors font-bold border border-slate-200 hover:border-rose-200 text-slate-500 cursor-pointer flex items-center gap-1 justify-center whitespace-nowrap"
                        >
                          <X size={12} />
                          <span>放弃/关闭</span>
                        </button>

                        <button
                          onClick={handleSaveToLocalOnly}
                          className="flex-1 md:flex-none p-2 px-3 text-xs bg-sky-550/10 hover:bg-sky-550/20 text-sky-850 rounded-xl transition-colors font-bold border border-sky-250 cursor-pointer flex items-center gap-1 justify-center whitespace-nowrap"
                        >
                          <Database size={11} className="text-sky-600" />
                          <span>仅保存至本地</span>
                        </button>
                        
                        <button
                          onClick={handleUploadToGoogleSheets}
                          disabled={isSyncingSheet}
                          className="flex-1 md:flex-none bg-emerald-600 hover:bg-emerald-700 text-white font-extrabold text-xs py-2 px-4.5 rounded-xl shadow-md transition-colors flex items-center justify-center gap-1.5 disabled:opacity-50 cursor-pointer shrink-0 whitespace-nowrap"
                          id="save-to-sheet-btn"
                        >
                          {isSyncingSheet ? <RefreshCw className="animate-spin" size={12} /> : <CheckCircle size={12} />}
                          <span>{isSyncingSheet ? '正在云端登记...' : '确认登记并追加云端'}</span>
                        </button>
                      </div>
                    </div>

                    {/* Scrollable container for Content */}
                    <div className="flex-1 overflow-y-auto p-4 sm:p-5 space-y-4 select-text">
                      {/* Sub Metadata Fields Inputs Row */}
                      <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-4 gap-4 bg-slate-50/50 p-4 border border-slate-100 rounded-2xl">
                        {/* Date */}
                        <div className="flex flex-col">
                          <label className="text-[9px] font-bold text-gray-400 uppercase mb-1">入库日期 (业务日期)</label>
                          <input
                            type="date"
                            value={activeDraft.date}
                            onChange={(e) => setActiveDraft({ ...activeDraft, date: e.target.value })}
                            className="border border-slate-200 rounded-xl p-2 font-mono text-xs text-slate-800 font-bold bg-white focus:ring-1 focus:ring-emerald-500 outline-hidden"
                          />
                        </div>

                        {/* Supplier */}
                        <div className="flex flex-col">
                          <label className="text-[9px] font-bold text-gray-400 uppercase mb-1">供应商/销货单位</label>
                          <input
                            type="text"
                            value={activeDraft.supplier}
                            onChange={(e) => setActiveDraft({ ...activeDraft, supplier: e.target.value })}
                            className="border border-slate-200 rounded-xl p-2 text-xs text-slate-800 font-bold bg-white focus:ring-1 focus:ring-emerald-500 outline-hidden"
                          />
                        </div>

                        {/* Receipt Number */}
                        <div className="flex flex-col">
                          <label className="text-[9px] font-bold text-gray-400 uppercase mb-1">关联单号/入库单号</label>
                          <input
                            type="text"
                            value={activeDraft.receiptNumber}
                            onChange={(e) => setActiveDraft({ ...activeDraft, receiptNumber: e.target.value })}
                            className="border border-slate-200 rounded-xl p-2 font-mono text-xs text-slate-800 font-bold bg-white focus:ring-1 focus:ring-emerald-500 outline-hidden"
                          />
                        </div>

                        {/* Notes */}
                        <div className="flex flex-col">
                          <label className="text-[9px] font-bold text-gray-400 uppercase mb-1">附加说明备注</label>
                          <input
                            type="text"
                            value={activeDraft.notes}
                            onChange={(e) => setActiveDraft({ ...activeDraft, notes: e.target.value })}
                            placeholder="选填"
                            className="border border-slate-200 rounded-xl p-2 text-xs text-slate-800 bg-white focus:ring-1 focus:ring-emerald-500 outline-hidden animate-none"
                          />
                        </div>
                      </div>

                      {/* Items List Table Structure */}
                      <div className="border border-slate-200/95 rounded-2xl overflow-x-auto bg-slate-50/10 max-h-[40vh] overflow-y-auto">
                        <table className="w-full text-left text-xs border-collapse min-w-[850px]">
                          <thead>
                            <tr className="bg-slate-50 text-slate-500 font-extrabold border-b border-slate-200/95 sticky top-0 z-10 text-[10px]">
                              <th className="py-2.5 px-3 w-[150px]">物料编码</th>
                              <th className="py-2.5 px-3 min-w-[200px]">产品/物料名称 *</th>
                              <th className="py-2.5 px-3 w-[120px]">规格型号</th>
                              <th className="py-2.5 px-3 w-[80px] text-right">入库数量 *</th>
                              <th className="py-2.5 px-3 w-[80px] text-center">计量单位</th>
                              <th className="py-2.5 px-3 w-[110px] text-right">不含税单价 (铢) *</th>
                              <th className="py-2.5 px-3 w-[110px] text-right">不含税合价 (铢)</th>
                              <th className="py-2.5 px-3 w-[50px] text-center">操作</th>
                            </tr>
                          </thead>
                          <tbody className="divide-y divide-slate-100 text-slate-700 bg-white">
                            {activeDraft.items.map((item, index) => (
                              <tr key={item.id} className="hover:bg-slate-50/35 transition-colors">
                                {/* Materials Code */}
                                <td className="py-1.5 px-3">
                                  <input
                                    type="text"
                                    value={item.code || ''}
                                    onChange={(e) => handleItemFieldChange(item.id, 'code', e.target.value)}
                                    placeholder="物料编码（非必填）"
                                    className="w-full bg-transparent border-b border-transparent focus:border-slate-350 outline-hidden pb-0.5 font-mono text-zinc-700 text-xs"
                                  />
                                </td>

                                {/* Materials Name */}
                                <td className="py-1.5 px-3 font-semibold">
                                  <input
                                    type="text"
                                    value={item.name}
                                    onChange={(e) => handleItemFieldChange(item.id, 'name', e.target.value)}
                                    placeholder="请输入物料/货物名称"
                                    className="w-full bg-transparent border-b border-transparent focus:border-emerald-550 outline-hidden font-medium text-slate-900 pb-0.5 text-xs"
                                    required
                                  />
                                </td>

                                {/* Specification */}
                                <td className="py-1.5 px-3">
                                  <input
                                    type="text"
                                    value={item.specification}
                                    onChange={(e) => handleItemFieldChange(item.id, 'specification', e.target.value)}
                                    placeholder="规格/型号"
                                    className="w-full bg-transparent border-b border-transparent focus:border-slate-350 outline-hidden pb-0.5 font-mono text-xs"
                                  />
                                </td>

                                {/* Quantity */}
                                <td className="py-1.5 px-3 text-right">
                                  <input
                                    type="number"
                                    step="any"
                                    value={item.quantity === 0 ? '' : item.quantity}
                                    onChange={(e) => handleItemFieldChange(item.id, 'quantity', Number(e.target.value))}
                                    className="w-full bg-transparent border-b border-transparent focus:border-emerald-550 outline-hidden text-right pb-0.5 font-mono font-bold text-xs"
                                    required
                                  />
                                </td>

                                {/* Unit */}
                                <td className="py-1.5 px-3 text-center">
                                  <input
                                    type="text"
                                    value={item.unit}
                                    onChange={(e) => handleItemFieldChange(item.id, 'unit', e.target.value)}
                                    placeholder="件/吨"
                                    className="w-full bg-transparent border-b border-transparent focus:border-slate-350 outline-hidden text-center pb-0.5 text-xs"
                                  />
                                </td>

                                {/* Unit Price (Untaxed) */}
                                <td className="py-1.5 px-3 text-right">
                                  <input
                                    type="number"
                                    step="any"
                                    value={item.unitPrice === 0 ? '' : item.unitPrice}
                                    onChange={(e) => handleItemFieldChange(item.id, 'unitPrice', Number(e.target.value))}
                                    className="w-full bg-transparent border-b border-transparent focus:border-emerald-550 outline-hidden text-right pb-0.5 font-mono text-xs font-semibold text-zinc-600"
                                    required
                                  />
                                </td>

                                {/* Total Sub Price (Untaxed) */}
                                <td className="py-1.5 px-3 text-right font-bold text-slate-800 font-mono text-xs whitespace-nowrap">
                                  ฿{item.totalPrice.toFixed(2)}
                                </td>

                                {/* Remove row */}
                                <td className="py-1.5 px-2 text-center">
                                  <button
                                    type="button"
                                    onClick={() => handleRemoveItemRow(item.id)}
                                    className="p-1 rounded text-slate-300 hover:text-rose-600 hover:bg-rose-50/50 transition-colors cursor-pointer"
                                    title="除名此行"
                                  >
                                    <Trash2 size={13} />
                                  </button>
                                </td>
                              </tr>
                            ))}

                            {/* Totals Summary Footer Rows inside Table */}
                            <tr className="bg-slate-50/50 border-t border-slate-100">
                              <td colSpan={6} className="py-2.5 px-3 text-right text-gray-400 font-semibold text-[10px]">
                                整单不含税金额：
                              </td>
                              <td className="py-2.5 px-3 text-right text-xs text-slate-700 font-mono font-black">
                                ฿{draftUntaxedTotal.toFixed(2)}
                              </td>
                              <td></td>
                            </tr>

                            <tr className="bg-slate-50/50">
                              <td colSpan={6} className="py-2.5 px-3 text-right text-gray-400 font-semibold text-[10px]">
                                7% 保障性税额 (=不含税总额 * 0.07)：
                              </td>
                              <td className="py-2.5 px-3 text-right text-xs text-amber-700 font-mono font-bold">
                                ฿{draftTax.toFixed(2)}
                              </td>
                              <td></td>
                            </tr>

                            <tr className="bg-emerald-50/15 border-t-2 border-emerald-100 font-extrabold text-slate-900">
                              <td colSpan={6} className="py-3 px-3 text-right text-emerald-950/85 text-[11px]">
                                含税金额合计 (=不含税总额 + 7%税额)：
                              </td>
                              <td className="py-3 px-3 text-right text-sm text-emerald-700 font-mono font-extrabold">
                                ฿{draftTaxInclusive.toFixed(2)}
                              </td>
                              <td className="py-3 px-2 text-center">
                                <button
                                  type="button"
                                  onClick={handleAddItemRow}
                                  className="text-emerald-700 hover:bg-emerald-50 hover:text-emerald-800 p-1 px-2 rounded font-bold text-[10px] flex items-center gap-0.5 mx-auto border border-emerald-200 cursor-pointer font-sans"
                                >
                                  <Plus size={11} />
                                  <span>加一行</span>
                                </button>
                              </td>
                            </tr>

                          </tbody>
                        </table>
                      </div>
                    </div>

                  </motion.div>
                </div>
              )}
            </AnimatePresence>

            {/* 4. Google Sheet Linked Ledger Board */}
            <div className="hidden md:block bg-white border border-slate-200/90 rounded-3xl p-6 shadow-xs space-y-5" id="local-ledger-board">
              <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 border-b border-slate-100 pb-4">
                <div className="space-y-1">
                  <h3 className="font-extrabold text-[14px] text-slate-900 tracking-tight flex items-center gap-2">
                    <Database size={16} className="text-emerald-600 font-extrabold animate-pulse" />
                    <span>Google Sheet 实时联动对账流水</span>
                    <span className="text-[10px] font-black bg-emerald-50 text-emerald-800 border border-emerald-150 px-1.5 py-0.5 rounded-full">
                      {sheetReceipts.length} 笔云端记录
                    </span>
                  </h3>
                  <div className="text-[10.5px] text-gray-400 font-medium leading-relaxed flex flex-wrap items-center gap-1.5">
                    {sheetConfig.spreadsheetId && (
                      <a
                        href={`https://docs.google.com/spreadsheets/d/${sheetConfig.spreadsheetId}`}
                        target="_blank"
                        rel="noreferrer"
                        className="text-emerald-600 hover:underline font-bold inline-flex items-center gap-0.5"
                      >
                        [打开 Google 电子表格 ↗]
                      </a>
                    )}
                  </div>
                </div>

                <div className="flex flex-wrap items-center gap-2">
                  <button
                    onClick={() => handleFetchSheetRecords(false)}
                    disabled={isFetchingSheet}
                    className="flex items-center gap-1.5 p-2 px-3 text-xs bg-slate-100 hover:bg-slate-200 text-slate-700 hover:text-slate-900 font-extrabold border border-slate-200 rounded-xl transition-all cursor-pointer disabled:opacity-50"
                  >
                    <RefreshCw size={13} className={isFetchingSheet ? "animate-spin text-emerald-600" : "text-slate-400"} />
                    <span>{isFetchingSheet ? "获取中..." : "刷新云端数据"}</span>
                  </button>

                  <button
                    onClick={() => {
                      if (sheetReceipts.length === 0) {
                        showToast("云端账目暂未加载，请先配置或读取云端表格！", "error");
                        return;
                      }
                      exportReceiptsToExcel(sheetReceipts);
                      showToast("🔄 正在生成云端对账明细 Excel，请注意下载提示！", "success");
                    }}
                    className="flex items-center gap-1.5 p-2 px-3 text-xs bg-emerald-600 hover:bg-emerald-700 text-white font-extrabold rounded-xl transition-all cursor-pointer shadow-2xs"
                  >
                    <FileSpreadsheet size={13} />
                    <span>同步导出为 Excel (.xlsx)</span>
                  </button>

                  <button
                    onClick={() => {
                      downloadReceiptTemplate();
                      showToast("已启动标准入库模板下载！", "success");
                    }}
                    className="flex items-center gap-1 p-2 px-3 text-xs bg-slate-50 hover:bg-slate-100 border border-slate-200 rounded-xl transition-colors font-semibold text-slate-600 cursor-pointer"
                  >
                    <Download size={11} />
                    <span>空录模板</span>
                  </button>
                </div>
              </div>

              {sheetFetchError && (
                <div className="bg-rose-50 border border-rose-150 rounded-2xl p-4 space-y-2 mt-2 select-text text-slate-800">
                  <div className="flex items-start gap-2 text-rose-800 font-bold text-xs">
                    <AlertCircle className="text-rose-500 shrink-0 mt-0.5" size={14} />
                    <span>云端流水同步发生异常：</span>
                  </div>
                  <p className="font-mono text-[10.5px] text-rose-700 bg-white/60 p-2.5 rounded-lg border border-rose-100/40 whitespace-pre-wrap">
                    {sheetFetchError}
                  </p>
                  {sheetFetchError.includes("doGet") && (
                    <div className="text-[10.5px] text-slate-600 space-y-2 mt-2 leading-relaxed pl-1">
                      <p className="font-extrabold text-slate-800 text-[11px] flex items-center gap-1">
                        <Sparkles size={12} className="text-emerald-500 animate-spin" />
                        <span>💡 问题解析与快速修复方案</span>
                      </p>
                      <p className="text-slate-600 text-[10.5px]">
                        系统之前仅支持向 Google Sheets 表格自动写入（doPost），而为了在此<b>实时显示、检索和导出云端数据流水</b>，我们需要通过最新版代码提供的 <code className="bg-rose-100/70 text-rose-800 px-1 py-0.5 rounded font-mono font-bold text-[10px]">doGet</code> 进行云端安全读取。
                      </p>
                      <div className="mt-2 bg-slate-50 border border-slate-150 p-3 rounded-xl space-y-2">
                        <p className="font-bold text-emerald-800 text-[11px]">🛠️ 只需要 15 秒更新部署：</p>
                        <ol className="list-decimal pl-4.5 space-y-1.5 font-semibold text-slate-700 text-[10.5px]">
                          <li>
                            点击页面右上角绿色的{" "}
                            <span className="text-emerald-700 font-extrabold bg-emerald-50 px-1 py-0.5 rounded border border-emerald-150">
                              【参数及云数据库配置】
                            </span>{" "}
                            按钮，复制最新的完整脚本代码。
                          </li>
                          <li>
                            打开您的 Google Sheet 表格页面，点击菜单栏：<b>【扩展程序 (Extensions)】</b> -&gt; <b>【Apps 脚本 (Apps Script)】</b>。
                          </li>
                          <li>
                            清空旧脚本编辑器中的全部内容，粘贴您刚才复制的新代码，并点击顶部的<b>「保存图标 (Save)」</b>。
                          </li>
                          <li>
                            <b>最关键一步：</b>点击右上角 <b>【部署 (Deploy)】</b> -&gt; <b>【新建部署 (New deployment)】</b>。
                          </li>
                          <li>
                            选中“Web 应用 (Web App)”，在<b>「谁具有访问权限 (Who has access)」</b>一栏中，<b>务必确保选择为「任何人 (Anyone)」</b>，然后点击部署。
                          </li>
                          <li>
                            复制产生的全新 Web App URL 更新到右上角我们的配置面板中，点击刷新，云端对账单据即刻秒级全量呈现！
                          </li>
                        </ol>
                      </div>
                    </div>
                  )}
                </div>
              )}

              {/* Search filter bar */}
              {sheetReceipts.length > 0 && (
                <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-3">
                  <div className="relative flex-1">
                    <Search size={14} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-gray-400" />
                    <input
                      type="text"
                      value={searchQuery}
                      onChange={(e) => setSearchQuery(e.target.value)}
                      placeholder="搜索金额 / 入库日期 / 供应商 / 物料等..."
                      className="w-full pl-9 pr-4 py-2 border border-slate-200 rounded-xl text-xs bg-slate-50/40 text-slate-800 focus:bg-white outline-hidden font-medium"
                    />
                  </div>
                </div>
              )}

              {/* Ledger list container with dual-mode view */}
              {sheetReceipts.length === 0 ? (
                <div className="text-center py-12 px-4 border-2 border-dashed border-slate-150 rounded-2xl bg-slate-50/25">
                  <div className="p-3 bg-slate-100/50 rounded-full inline-block text-slate-400 mb-3 animate-bounce">
                    <CloudLightning size={24} className="text-emerald-500" />
                  </div>
                  <p className="text-xs font-bold text-slate-850">
                    {!sheetConfig.spreadsheetId 
                      ? "⚠️ 尚未关联 Google Sheet 云端电子表" 
                      : (isFetchingSheet ? "正在从 Google Spreadsheet 管道同步下载账目记录..." : "☁️ Google Sheet 离线或云表格内容为空")}
                  </p>
                  <p className="text-[10.5px] text-gray-400 max-w-lg mx-auto leading-relaxed mt-2 font-medium">
                    {!sheetConfig.spreadsheetId ? (
                      <span>请点击右上角<b>【参数及云数据库配置】</b>在配置面板输入您的 Google Spreadsheet ID 并且核实登录状态。系统建立联动后即可实现秒级自动刷新读取！</span>
                    ) : (
                      <span>若您刚配置，请点击上方<b>【刷新云端数据】</b>加载，或确认指定的 Worksheet 工作表标签名（当前：<b>「{sheetConfig.sheetName || 'Sheet1'}」</b>）在您的 Google Drive 电子表中已真实存在且拥有至少一行物料对账数据。</span>
                    )}
                  </p>
                </div>
              ) : filteredReceipts.length === 0 ? (
                <div className="text-center py-8 text-gray-400 text-xs font-medium">
                  没有匹配 "{searchQuery}" 的搜索记录。
                </div>
              ) : (
                /* Enhanced Table View where rows are perfectly separated using neat serial index values */
                <div className="border border-slate-200/90 rounded-2xl overflow-hidden bg-white max-h-[580px] overflow-y-auto shadow-2xs">
                  <table className="w-full text-left text-xs border-collapse">
                    <thead>
                      <tr className="bg-slate-50 text-slate-500 font-extrabold border-b border-slate-200/90 text-[10px]">
                        <th className="py-2.5 px-3 w-[50px] text-center">序</th>
                        <th className="py-2.5 px-3 w-[82px]">同步状态</th>
                        <th className="py-2.5 px-3 w-[91px]">入库日期</th>
                        <th className="py-2.5 px-3">供应商 / 发货单位</th>
                        <th className="py-2.5 px-3 w-[100px] text-right">品类数/数量</th>
                        <th className="py-2.5 px-3 w-[110px] text-right">含税总计</th>
                        <th className="py-2.5 px-3 w-[250px] text-center">操作</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100 text-slate-700">
                      {filteredReceipts.map((record, index) => {
                        const itemsLength = record.items.length;
                        const totalQty = record.items.reduce((s, i) => s + i.quantity, 0);
                        const isSynced = record.status === 'completed';
                        
                        // Calculating tax info
                        const untaxedTotal = record.totalAmount;
                        const taxAmount = untaxedTotal * 0.07;
                        const inclusiveTotal = untaxedTotal + taxAmount;
                        
                        // Serial number computation
                        const rowNum = filteredReceipts.length - index;

                        return (
                          <tr 
                            key={record.id} 
                            className={`hover:bg-slate-50/30 transition-colors ${
                              index % 2 === 1 ? 'bg-slate-50/20' : 'bg-white'
                            }`}
                          >
                            {/* Visual index column (makes counting receipts incredibly simple) */}
                            <td className="py-3 px-3 text-center text-[10px] font-bold font-mono text-slate-400">
                              {rowNum < 10 ? `0${rowNum}` : rowNum}
                            </td>

                            {/* Status badge */}
                            <td className="py-3 px-3">
                              {record.id.startsWith('sheet-') ? (
                                <span className="inline-flex items-center gap-1 text-[9.5px] font-bold bg-indigo-50 text-indigo-700 border border-indigo-150 px-2.5 py-0.5 rounded-full" title="云端实时同步">
                                  <CloudLightning size={10} className="text-indigo-600 animate-pulse" />
                                  <span>云端</span>
                                </span>
                              ) : isSynced ? (
                                <span className="inline-flex items-center gap-1 text-[9.5px] font-bold bg-emerald-50 text-emerald-700 border border-emerald-150 px-2.5 py-0.5 rounded-full" title="已成功追加备份到云端">
                                  <CheckCircle size={10} />
                                  <span>已同步</span>
                                </span>
                              ) : (
                                <span 
                                  className="inline-flex items-center gap-1 text-[9.5px] font-bold bg-amber-50 text-amber-700 border border-amber-150 px-2.5 py-0.5 rounded-full"
                                  title="未成功追加到 Google Sheets，可以点击右侧 [云同步] 按钮重新对账追加！"
                                >
                                  <CloudOff size={10} />
                                  <span>待云同步</span>
                                </span>
                              )}
                            </td>

                            {/* Date */}
                            <td className="py-3 px-3 font-mono text-zinc-500 text-[11px] font-medium">
                              {record.date ? record.date.substring(0, 10) : ''}
                            </td>

                            {/* Supplier name */}
                            <td className="py-3 px-3 font-bold text-slate-800 truncate max-w-[180px]" title={record.supplier}>
                              {record.supplier}
                            </td>

                            {/* Items breakdown list count */}
                            <td className="py-3 px-3 text-right text-gray-500 text-[11px] font-medium">
                              {itemsLength}品 / <span className="font-bold text-slate-850 font-mono">{totalQty}</span>件
                            </td>

                            {/* Total price in THB */}
                            <td className="py-3 px-3 text-right font-mono font-extrabold text-slate-900 text-[11.5px]">
                              ฿{inclusiveTotal.toFixed(2)}
                            </td>

                            {/* Actions bar for tabular flow */}
                            <td className="py-2 px-3 text-center">
                              <div className="flex items-center justify-center gap-1.5 flex-wrap">
                                <button
                                  onClick={() => setSelectedRecordForDetail(record)}
                                  className="p-1 px-1.5 bg-slate-50 border border-slate-250 rounded text-slate-600 hover:text-emerald-750 hover:bg-emerald-50/40 hover:border-emerald-250 text-[10px] font-bold transition-all flex items-center gap-0.5 cursor-pointer"
                                  title="查看明细"
                                >
                                  <Eye size={11} className="text-slate-400" />
                                  <span>明细</span>
                                </button>

                                <button
                                  onClick={() => handleLoadRecordToDraft(record)}
                                  className="p-1 px-1.5 bg-slate-50 border border-slate-250 rounded text-slate-600 hover:text-indigo-700 hover:bg-indigo-50/40 hover:border-indigo-250 text-[10px] font-bold transition-all flex items-center gap-0.5 cursor-pointer"
                                  title="重载入发票输入表格二次编辑"
                                >
                                  <Edit size={11} className="text-slate-400" />
                                  <span>编辑</span>
                                </button>

                                {!isSynced && (
                                  <button
                                    onClick={() => handleRetrySyncTable(record)}
                                    className="p-1 px-1.5 bg-amber-500/10 border border-amber-250 text-amber-800 hover:text-white hover:bg-amber-600 hover:border-amber-600 text-[10px] font-bold transition-all flex items-center gap-0.5 cursor-pointer rounded animate-pulse"
                                    title="手动触发将该条明细同步到 Google Sheet 中"
                                  >
                                    <CloudLightning size={11} />
                                    <span>云同步</span>
                                  </button>
                                )}



                                {record.id.startsWith('sheet-') ? (
                                  <button
                                    onClick={() => {
                                      showToast("💡 提示：该真实云端流水需在 Google Sheet 中删改", "error");
                                      alert(
                                        "📌 财务记账合规提示：\n\n该条入库单据在云端 Google Sheet 电子表中已正式登记备案。为保护发票审计链与做账规范痕迹，外部记账端不支持单向远程任意物理注销数据。\n\n如需修正：\n1. 请直接在 Google Sheets 表格网页中查找并对该笔明细数据整行进行清除或修改。\n2. 重新回到本页账簿列表，点击上方的「刷新云端数据」按钮。\n\n点击确定即将为你直接打开 Google 电子表格窗口。"
                                      );
                                      if (sheetConfig.spreadsheetId) {
                                        window.open(`https://docs.google.com/spreadsheets/d/${sheetConfig.spreadsheetId}`, '_blank');
                                      }
                                    }}
                                    className="p-1 px-1.5 rounded text-rose-500 hover:text-rose-700 hover:bg-rose-50 border border-rose-200 hover:border-rose-350 transition-colors cursor-pointer flex items-center gap-0.5 font-bold"
                                    title="此为云端正式记账对账凭证，需在原电子表中管理"
                                  >
                                    <Trash2 size={11} />
                                    <span>云删除</span>
                                  </button>
                                ) : (
                                  confirmingDeleteId === record.id ? (
                                    <div className="flex items-center gap-1 bg-rose-50 border border-rose-250 rounded p-0.5 whitespace-nowrap animate-fade-in shrink-0">
                                      <span className="text-[9px] text-rose-700 font-extrabold px-1">确认删除？</span>
                                      <button
                                        onClick={() => handleDeleteRecord(record.id)}
                                        className="p-0.5 px-1 bg-rose-600 hover:bg-rose-700 text-white text-[9px] font-bold rounded cursor-pointer transition-colors"
                                        title="确认删除该本地记录"
                                      >
                                        确定
                                      </button>
                                      <button
                                        onClick={() => setConfirmingDeleteId(null)}
                                        className="p-0.5 px-1 bg-slate-200 hover:bg-slate-300 text-slate-700 text-[9px] font-bold rounded cursor-pointer transition-colors"
                                        title="取消"
                                      >
                                        取消
                                      </button>
                                    </div>
                                  ) : (
                                    <button
                                      onClick={() => setConfirmingDeleteId(record.id)}
                                      className="p-1 px-1.5 rounded text-slate-400 hover:text-rose-600 hover:bg-rose-50 border border-slate-200 hover:border-rose-200 transition-colors cursor-pointer flex items-center gap-0.5"
                                      title="彻底删除此条本地记录"
                                    >
                                      <Trash2 size={11} />
                                      <span>删除</span>
                                    </button>
                                  )
                                )}
                              </div>
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              )}
            </div>

        </div>

      </main>

      {/* 5. Detailed View Overlay Modal */}
      <AnimatePresence>
        {selectedRecordForDetail && (
          <div className="fixed inset-0 bg-black/40 backdrop-blur-xs flex items-center justify-center p-4 z-50">
            <motion.div
              initial={{ scale: 0.95, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.95, opacity: 0 }}
              className="bg-white rounded-3xl max-w-3xl w-full max-h-[85vh] overflow-hidden shadow-2xl flex flex-col"
            >
              <div className="p-6 border-b border-slate-100 flex items-center justify-between bg-slate-50/50">
                <div className="flex items-center gap-2">
                  <div className="p-2 bg-emerald-500 rounded-xl text-white">
                    <FileText size={18} />
                  </div>
                  <div>
                    <h3 className="font-extrabold text-sm text-slate-950">
                      单据入库货件明细 · [ {selectedRecordForDetail.receiptNumber} ]
                    </h3>
                    <p className="text-[10px] text-gray-400 font-medium font-semibold">
                      记录创建时间: {new Date(selectedRecordForDetail.createdAt).toLocaleString('zh-CN')}
                    </p>
                  </div>
                </div>
                
                <button
                  onClick={() => setSelectedRecordForDetail(null)}
                  className="p-1.5 hover:bg-slate-100 rounded-lg text-slate-400 hover:text-slate-705 transition-colors cursor-pointer"
                >
                  <X size={18} />
                </button>
              </div>

              {/* Modal Body */}
              <div className="p-6 overflow-y-auto space-y-5 text-xs">
                {/* Meta Summary Cards */}
                <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
                  <div className="p-3 bg-slate-50 border border-slate-150 rounded-xl space-y-1">
                    <span className="text-[9px] font-bold text-gray-400 uppercase">业务日期</span>
                    <p className="font-mono text-xs font-bold text-slate-800">
                      {selectedRecordForDetail.date ? selectedRecordForDetail.date.substring(0, 10) : ''}
                    </p>
                  </div>

                  <div className="p-3 bg-slate-50 border border-slate-150 rounded-xl space-y-1">
                    <span className="text-[9px] font-bold text-gray-400 uppercase">供应商/销售商</span>
                    <p className="text-xs font-bold text-slate-800 truncate" title={selectedRecordForDetail.supplier}>
                      {selectedRecordForDetail.supplier}
                    </p>
                  </div>

                  <div className="p-3 bg-slate-50 border border-slate-150 rounded-xl space-y-1">
                    <span className="text-[9px] font-bold text-gray-400 uppercase">税前小计金额</span>
                    <p className="font-mono text-xs font-bold text-slate-800">฿{selectedRecordForDetail.totalAmount.toFixed(2)}</p>
                  </div>

                  <div className="p-3 bg-slate-50 border border-slate-150 rounded-xl space-y-1">
                    <span className="text-[9px] font-bold text-gray-400 uppercase font-bold text-emerald-900">确保含税总价 (含7%)</span>
                    <p className="font-mono text-xs font-extrabold text-emerald-800">฿{(selectedRecordForDetail.totalAmount * 1.07).toFixed(2)}</p>
                  </div>
                </div>

                {/* Notes Block */}
                {selectedRecordForDetail.notes && (
                  <div className="p-3 bg-amber-500/5 border border-amber-100 rounded-xl text-[11px] text-zinc-650">
                    <span className="font-extrabold text-amber-900 block mb-0.5">登记说明：</span>
                    {selectedRecordForDetail.notes}
                  </div>
                )}

                {/* Items listing table */}
                <div className="border border-slate-200 rounded-xl overflow-hidden">
                  <table className="w-full text-left border-collapse text-[11px]">
                    <thead>
                      <tr className="bg-slate-50 text-slate-550 font-bold border-b border-slate-200">
                        <th className="p-2 px-3">物料编码</th>
                        <th className="p-2 px-3 text-left">产品/物料名称</th>
                        <th className="p-2 px-3">规格型号</th>
                        <th className="p-2 px-3 text-right">入库数</th>
                        <th className="p-2 px-3 text-center">计量单位</th>
                        <th className="p-2 px-3 text-right">单价 (不含税)</th>
                        <th className="p-2 px-3 text-right">小计金额</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100 text-slate-700 bg-white">
                      {selectedRecordForDetail.items.map((it) => (
                        <tr key={it.id} className="hover:bg-slate-50/10">
                          <td className="p-2 px-3 font-mono text-zinc-400">{it.code || '-'}</td>
                          <td className="p-2 px-3 font-extrabold text-slate-900">{it.name}</td>
                          <td className="p-2 px-3 text-slate-500 font-mono">{it.specification || '-'}</td>
                          <td className="p-2 px-3 text-right font-mono font-bold">{it.quantity}</td>
                          <td className="p-2 px-3 text-center text-slate-500">{it.unit || '件'}</td>
                          <td className="p-2 px-3 text-right font-mono text-zinc-650">฿{it.unitPrice.toFixed(2)}</td>
                          <td className="p-2 px-3 text-right font-mono font-semibold text-slate-850">฿{it.totalPrice.toFixed(2)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>

              {/* Modal Footer */}
              <div className="p-4 px-6 border-t border-slate-100 bg-slate-50/50 flex items-center justify-between">
                <span className="text-[10.5px] text-gray-400 font-semibold">
                  共计 {selectedRecordForDetail.items.length} 种物料明细数据
                </span>

                <div className="flex items-center gap-2">
                  <button
                    onClick={() => {
                      exportReceiptsToExcel([selectedRecordForDetail]);
                      showToast("单份 Excel 导出成功！", "success");
                    }}
                    className="p-2 px-4 rounded-xl text-xs bg-emerald-600 hover:bg-emerald-700 text-white font-extrabold shadow-2xs cursor-pointer flex items-center gap-1"
                  >
                    <FileSpreadsheet size={12} />
                    <span>导出此单 Excel</span>
                  </button>

                  <button
                    onClick={() => setSelectedRecordForDetail(null)}
                    className="p-2 px-4 rounded-xl text-xs bg-white hover:bg-slate-100 border border-slate-200 text-slate-600 font-semibold cursor-pointer"
                  >
                    关闭
                  </button>
                </div>
              </div>

            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {/* Footer copyright */}
      <footer className="text-center py-6 text-[10.5px] text-slate-400 mt-auto border-t border-slate-150">
        <p>© 2026 智能物料验收入库账本 · Web App 精简版</p>
        <p className="mt-0.5">连通 Google API 和 Apps Script 架设服务 · 算法驱动 Gemini 3.5 AI</p>
      </footer>

    </div>
  );
}
