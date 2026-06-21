import * as XLSX from 'xlsx';
import { ReceiptRecord, ReceiptItem } from '../types';

// Helper to generate unique IDs
const generateId = () => Math.random().toString(36).substring(2, 9);

/**
 * Exports receipt records into a beautifully structured Excel file containing both Summary and Breakdown sheets.
 */
export function exportReceiptsToExcel(records: ReceiptRecord[]) {
  // 1. Prepare Summary Sheet data
  const summaryData = records.map(r => ({
    '入库日期': r.date,
    '入库单号': r.receiptNumber,
    '供应商/销售商': r.supplier,
    '物品种类数': r.items.length,
    '总金额(泰铢)': r.totalAmount,
    '经办员/收料人': r.operator || '未指定',
    '备注说明': r.notes || '',
    '单据状态': r.status === 'completed' ? '已入库' : '草稿'
  }));

  // 2. Prepare Detailed Breakdown Sheet data
  const breakdownData: any[] = [];
  records.forEach(r => {
    r.items.forEach(item => {
      breakdownData.push({
        '入库日期': r.date,
        '关联单号': r.receiptNumber,
        '供应商': r.supplier,
        '物料编码': item.code || '',
        '产品名称': item.name,
        '规格型号': item.specification || '-',
        '数量': item.quantity,
        '计量单位': item.unit || '件',
        '入库单价(泰铢)': item.unitPrice,
        '小计金额(泰铢)': item.totalPrice,
        '经办员': r.operator || '未指定'
      });
    });
  });

  // Create worksheets
  const summaryWS = XLSX.utils.json_to_sheet(summaryData);
  const breakdownWS = XLSX.utils.json_to_sheet(breakdownData);

  // Auto-fit column widths
  const autoFitColumns = (ws: XLSX.WorkSheet) => {
    if (!ws['!ref']) return;
    const range = XLSX.utils.decode_range(ws['!ref']);
    const colWidths = [];
    for (let C = range.s.c; C <= range.e.c; ++C) {
      let maxWidth = 12; // default min width
      for (let R = range.s.r; R <= range.e.r; ++R) {
        const cell = ws[XLSX.utils.encode_cell({ r: R, c: C })];
        if (cell && cell.v) {
          const valStr = String(cell.v);
          // Simple estimation of character length, giving double weight to non-ASCII character (Chinese characters)
          let charLen = 0;
          for (let i = 0; i < valStr.length; i++) {
            charLen += valStr.charCodeAt(i) > 127 ? 2 : 1;
          }
          maxWidth = Math.max(maxWidth, charLen + 2);
        }
      }
      colWidths.push({ wch: Math.min(maxWidth, 40) }); // cap at width of 40
    }
    ws['!cols'] = colWidths;
  };

  autoFitColumns(summaryWS);
  autoFitColumns(breakdownWS);

  // New Workbook
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, summaryWS, '入库票据汇总');
  XLSX.utils.book_append_sheet(wb, breakdownWS, '入库商品清单');

  // Trigger browser download
  const dateStr = new Date().toISOString().split('T')[0];
  XLSX.writeFile(wb, `入库票据统计同步表_${dateStr}.xlsx`);
}

/**
 * Downloads a standard Excel skeleton template so users can enter receipts manually and load them into the application structure.
 */
export function downloadReceiptTemplate() {
  const templateRaw = [
    {
      '入库日期(YYYY-MM-DD)*': '2026-06-13',
      '入库单号*': 'RK202606130001',
      '供应商名称*': '测试德意志机电零件商',
      '产品名称*': '精密轴承01型',
      '规格型号(选填)': 'Z-2022',
      '入库数量*': 100,
      '计量单位(套/支/件/个)*': '套',
      '入库单价(泰铢)*': 45.5,
      '经办员/收方签字': '李经理',
      '备注/说明': '高精密航天标准'
    },
    {
      '入库日期(YYYY-MM-DD)*': '2026-06-13',
      '入库单号*': 'RK202606130001',
      '供应商名称*': '测试德意志机电零件商',
      '产品名称*': '重型联轴器',
      '规格型号(选填)': 'CX-300',
      '入库数量*': 5,
      '计量单位(套/支/件/个)*': '套',
      '入库单价(泰铢)*': 1200.00,
      '经办员/收方签字': '李经理',
      '备注/说明': '附出厂合格检验报告'
    }
  ];

  const ws = XLSX.utils.json_to_sheet(templateRaw);
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, '标准录入模板');
  XLSX.writeFile(wb, '入库单据录入向导模板.xlsx');
}

/**
 * Reads Excel file uploaded by user and parses it into records
 */
export function importReceiptsFromExcel(file: File): Promise<ReceiptRecord[]> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = (e) => {
      try {
        const data = e.target?.result;
        if (!data) throw new Error("无法读取文件内容。");

        const workbook = XLSX.read(data, { type: 'binary' });
        const firstSheetName = workbook.SheetNames[0];
        const sheet = workbook.Sheets[firstSheetName];
        const rawJson: any[] = XLSX.utils.sheet_to_json(sheet);

        if (rawJson.length === 0) {
          throw new Error("工作表中未检测到任何数据行。");
        }

        // Map column values (support both Summary templates and standard flat templates)
        // Group rows by receiptNumber since items of the same invoice need to pack together!
        const receiptGroup: { [key: string]: Partial<ReceiptRecord> & { tempItems: any[] } } = {};

        rawJson.forEach((row) => {
          // Identify keys dynamically with fallback options
          const date = row['入库日期'] || row['入库日期(YYYY-MM-DD)*'] || row['日期'] || new Date().toISOString().split('T')[0];
          const rNumber = row['入库单号'] || row['关联单号'] || row['单号'] || `IMP-${generateId().toUpperCase()}`;
          const supplier = row['供应商'] || row['供应商/销售商'] || row['供应商名称*'] || '未知供货商';
          const operator = row['经办员'] || row['经办员/收料人'] || row['经办员/收方签字'] || row['收料人'] || '';
          const notes = row['备注说明'] || row['备注'] || row['备注/说明'] || '';

          // Item fields
          const itemName = row['产品名称'] || row['商品名称'] || row['货物名称'] || row['名称(物品名称)*'] || row['物品名称'] || '';
          if (!itemName) return; // Ignore row if no item name is provided

          const itemCode = row['物料编码'] || row['物料代码'] || row['产品代码'] || row['编码'] || '';
          const spec = row['规格型号'] || row['规格'] || row['型号'] || row['规格型号(选填)'] || '';
          const qty = Number(row['数量'] || row['入库数量'] || row['入库数量*'] || 1);
          const unit = row['计量单位'] || row['单位'] || row['计量单位(套/支/件/个)*'] || '件';
          const price = Number(row['单价'] || row['入库单价(元)'] || row['入库单价(元)*'] || row['入库单价(泰铢)'] || row['入库单价(泰铢)*'] || 0);
          const tPrice = Number(row['小计金额(元)'] || row['小计金额(泰铢)'] || row['金额'] || row['小计'] || (qty * price));

          if (!receiptGroup[rNumber]) {
            receiptGroup[rNumber] = {
              id: generateId(),
              receiptNumber: rNumber,
              date: String(date).trim(),
              supplier: String(supplier).trim(),
              operator: String(operator).trim(),
              notes: String(notes).trim(),
              status: 'completed',
              createdAt: new Date().toISOString(),
              tempItems: []
            };
          }

          receiptGroup[rNumber].tempItems.push({
            id: generateId(),
            code: String(itemCode).trim(),
            name: String(itemName).trim(),
            specification: String(spec).trim(),
            quantity: qty,
            unit: String(unit).trim(),
            unitPrice: price,
            totalPrice: tPrice
          });
        });

        // Assemble records
        const finalizedRecords: ReceiptRecord[] = Object.values(receiptGroup).map(group => {
          const items: ReceiptItem[] = group.tempItems;
          const totalAmount = items.reduce((sum, current) => sum + current.totalPrice, 0);

          return {
            id: group.id!,
            receiptNumber: group.receiptNumber!,
            date: group.date!,
            supplier: group.supplier!,
            operator: group.operator!,
            notes: group.notes!,
            status: group.status!,
            imageUrl: '',
            createdAt: group.createdAt!,
            items: items,
            totalAmount: Math.round(totalAmount * 100) / 100
          };
        });

        resolve(finalizedRecords);
      } catch (err: any) {
        reject(err);
      }
    };

    reader.onerror = (err) => reject(err);
    reader.readAsBinaryString(file);
  });
}
