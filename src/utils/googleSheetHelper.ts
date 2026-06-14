export interface GoogleSheetConfig {
  syncMode: 'appsScript' | 'directApi';
  spreadsheetId: string;
  sheetName: string;
  appsScriptUrl: string;
  autoSync: boolean;
}

const CONFIG_KEY = 'google_sheets_sync_config_v2';

export const defaultSheetConfig: GoogleSheetConfig = {
  syncMode: 'appsScript',
  spreadsheetId: '',
  sheetName: 'Sheet1',
  appsScriptUrl: '',
  autoSync: true,
};

export function getGoogleSheetConfig(): GoogleSheetConfig {
  const saved = localStorage.getItem(CONFIG_KEY);
  if (saved) {
    try {
      return { ...defaultSheetConfig, ...JSON.parse(saved) };
    } catch {
      return defaultSheetConfig;
    }
  }
  return defaultSheetConfig;
}

export function saveGoogleSheetConfig(config: GoogleSheetConfig) {
  localStorage.setItem(CONFIG_KEY, JSON.stringify(config));
}

/**
 * Format receipt data rows for Google Sheet insertion
 * Row columns: 入库日期 | 供应商 | 物料编码 | 物料名称 | 规格型号 | 单位 | 数量 | 不含税单价 | 不含税金额（为整单合计的不含税金额） | 7%税额 | 含税金额 | 入库单号 | 同步时间
 */
export function formatReceiptForSheet(record: {
  date: string;
  supplier: string;
  items: { code?: string; name: string; specification: string; quantity: number; unit: string; unitPrice: number; totalPrice: number }[];
  receiptNumber: string;
  totalAmount: number;
}) {
  const untaxedTotal = record.totalAmount;
  const taxAmount = Math.round((untaxedTotal * 0.07) * 100) / 100;
  const taxInclusive = Math.round((untaxedTotal + taxAmount) * 100) / 100;
  const localTime = new Date().toLocaleString('zh-CN', { timeZone: 'Asia/Shanghai' });

  // 1. Regular item rows representing the voucher entries
  const rows: any[][] = record.items.map((item, index) => [
    record.date,                         // 1. 入库日期
    record.supplier,                     // 2. 供应商
    item.code || '',                     // 3. 物料编码
    item.name,                           // 4. 物料名称
    item.specification || '',            // 5. 规格型号
    item.unit || '件',                   // 6. 单位
    item.quantity,                       // 7. 数量
    item.unitPrice,                      // 8. 不含税单价
    Math.round((item.quantity * item.unitPrice) * 100) / 100, // 9. 不含税金额 (小计)
    index === 0 ? untaxedTotal : '',                        // 10. 整单不含税总价 (首行)
    index === 0 ? taxAmount : '',                           // 11. 7%税额 (首行)
    index === 0 ? taxInclusive : '',                         // 12. 含税总金额 (首行)
  ]);

  return rows;
}

/**
 * Sync using standard Client-Side Google Sheets API via server-side proxy
 */
export async function syncDirectToGoogleSheet(
  config: GoogleSheetConfig,
  accessToken: string,
  record: Parameters<typeof formatReceiptForSheet>[0]
) {
  if (!config.spreadsheetId) {
    throw new Error('未配置 Google Spreadsheet ID！');
  }

  const rows = formatReceiptForSheet(record);
  const sheetTab = config.sheetName ? config.sheetName.trim() : 'Sheet1';
  const range = `${sheetTab}!A:L`;

  // Route through same-origin backend to prevent browser sandbox and CORS issues
  const response = await fetch('/api/proxy-direct-sheets', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({
      spreadsheetId: config.spreadsheetId,
      accessToken: accessToken,
      values: rows,
      range: range
    })
  });

  const resJson = await response.json().catch(() => ({}));

  if (!response.ok || !resJson.success) {
    const errorMsg = resJson.error || `HTTP ${response.status}`;
    console.error('Google Sheets sync error via proxy:', errorMsg);
    
    if (response.status === 404 || errorMsg.includes('not found') || errorMsg.includes('Unable to parse')) {
      throw new Error(`写入失败，请检查 Spreadsheet ID 是否正确，且指定的表名「${sheetTab}」是否存在！`);
    } else if (response.status === 401 || response.status === 403 || errorMsg.includes('expire') || errorMsg.includes('auth')) {
      throw new Error('Google 授权已过期。请重新完成“Sign in with Google”授权。');
    }
    throw new Error(`Google Sheets 写入失败: ${errorMsg}`);
  }

  return resJson.data;
}

/**
 * Sync using Google Apps Script Web App via server-side proxy
 */
export async function syncViaAppsScript(
  config: GoogleSheetConfig,
  record: Parameters<typeof formatReceiptForSheet>[0]
) {
  if (!config.appsScriptUrl) {
    throw new Error('未配置 Google Apps Script 部署 URL！');
  }

  const rows = formatReceiptForSheet(record);

  // Route through same-origin backend to prevent sandbox CORS preflight blocking
  const response = await fetch('/api/proxy-apps-script', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({
      appsScriptUrl: config.appsScriptUrl.trim(),
      spreadsheetId: config.spreadsheetId,
      sheetName: config.sheetName || 'Sheet1',
      rows: rows
    })
  });

  const resJson = await response.json().catch(() => ({}));

  if (!response.ok || !resJson.success) {
    const errorMsg = resJson.error || `HTTP ${response.status}`;
    throw new Error(`Google Apps Script 追加写入失败: ${errorMsg}`);
  }

  return resJson.data || resJson;
}

/**
 * Parsed spreadsheet raw data rows into active ReceiptRecord objects
 */
export function parseSheetRowsToReceipts(rows: any[][]): any[] {
  if (!rows || rows.length <= 1) return [];
  
  const dataRows = rows.slice(1); // skip header row
  const records: any[] = [];
  let currentRecord: any = null;
  
  for (let i = 0; i < dataRows.length; i++) {
    const row = dataRows[i];
    if (!row || row.length < 4) continue; // Skip too short or empty lines
    
    const date = row[0] ? String(row[0]).trim() : '';
    const supplier = row[1] ? String(row[1]).trim() : '';
    const code = row[2] ? String(row[2]).trim() : '';
    const name = row[3] ? String(row[3]).trim() : '';
    const specification = row[4] ? String(row[4]).trim() : '';
    const unit = row[5] ? String(row[5]).trim() : '件';
    const quantity = row[6] ? parseFloat(String(row[6]).replace(/[^\d.-]/g, '')) || 0 : 0;
    const unitPrice = row[7] ? parseFloat(String(row[7]).replace(/[^\d.-]/g, '')) || 0 : 0;
    const itemSubtotal = row[8] ? parseFloat(String(row[8]).replace(/[^\d.-]/g, '')) || 0 : 0;
    
    const untaxedTotal = row[9] ? parseFloat(String(row[9]).replace(/[^\d.-]/g, '')) || 0 : 0;
    const taxAmount = row[10] ? parseFloat(String(row[10]).replace(/[^\d.-]/g, '')) || 0 : 0;
    const taxInclusive = row[11] ? parseFloat(String(row[11]).replace(/[^\d.-]/g, '')) || 0 : 0;
    
    if (!name && !supplier && !date) continue;
    
    // Determine start of a record.
    // It is a new record if we have date & supplier AND (untaxedTotal > 0 OR currentRecord is null)
    const isNewRecord = (untaxedTotal > 0 || currentRecord === null) && date && supplier;
    
    if (isNewRecord) {
      if (currentRecord) {
        records.push(currentRecord);
      }
      
      const datePart = date ? date.replace(/-/g, '') : new Date().toISOString().slice(0, 10).replace(/-/g, '');
      const serial = records.length + 1;
      const receiptNo = `AP${datePart}${1000 + serial}`;
      
      currentRecord = {
        id: `sheet-${records.length}-${Date.now()}-${Math.random().toString(36).substr(2, 4)}`,
        receiptNumber: receiptNo,
        date: date,
        supplier: supplier,
        items: [],
        totalAmount: untaxedTotal || itemSubtotal || 0,
        operator: '系统同步',
        notes: '由 Google 电子表格联动生成',
        status: 'completed',
        createdAt: new Date().toISOString()
      };
    }
    
    if (currentRecord && name) {
      currentRecord.items.push({
        id: `item-${currentRecord.items.length}-${Math.random().toString(36).substr(2, 4)}`,
        code: code,
        name: name,
        specification: specification,
        quantity: quantity,
        unit: unit,
        unitPrice: unitPrice,
        totalPrice: itemSubtotal || (quantity * unitPrice)
      });
      
      if (!currentRecord.totalAmount && currentRecord.totalAmount === 0) {
        currentRecord.totalAmount += (quantity * unitPrice);
      }
    }
  }
  
  if (currentRecord) {
    records.push(currentRecord);
  }
  
  return records;
}

/**
 * Fetch and link records directly from Google Sheets or Apps Script URL
 */
export async function fetchRecordsFromGoogleSheet(
  config: GoogleSheetConfig,
  accessToken: string | null
): Promise<any[]> {
  if (!config.spreadsheetId) {
    throw new Error('未配置 Google Spreadsheet ID！请在设置面板中输入');
  }

  if (config.syncMode === 'appsScript') {
    if (!config.appsScriptUrl) {
      throw new Error('未配置 Google Apps Script 部署 URL！请在设置面板中输入');
    }

    const response = await fetch('/api/proxy-apps-script-get', {
      method: "POST",
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        appsScriptUrl: config.appsScriptUrl.trim(),
        spreadsheetId: config.spreadsheetId,
        sheetName: config.sheetName || 'Sheet1'
      })
    });

    const resJson = await response.json().catch(() => ({}));
    if (!response.ok || resJson.success === false) {
      const errorMsg = resJson.error || `HTTP ${response.status}`;
      throw new Error(errorMsg);
    }

    return parseSheetRowsToReceipts(resJson.rows || []);
  } else {
    // directApi mode
    if (!accessToken) {
      throw new Error('Google API 未授权！请先点击下方的“Sign in with Google”按钮登录授权。');
    }

    const response = await fetch('/api/proxy-get-sheets', {
      method: "POST",
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        spreadsheetId: config.spreadsheetId,
        accessToken: accessToken,
        sheetName: config.sheetName || 'Sheet1'
      })
    });

    const resJson = await response.json().catch(() => ({}));
    if (!response.ok || !resJson.success) {
      const errorMsg = resJson.error || `HTTP ${response.status}`;
      throw new Error(errorMsg);
    }

    return parseSheetRowsToReceipts(resJson.data?.values || []);
  }
}
