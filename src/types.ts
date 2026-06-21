export interface ReceiptItem {
  id: string;
  code?: string; // 物料编码
  name: string;
  specification: string; // specs or model
  quantity: number;
  unit: string;
  unitPrice: number;
  totalPrice: number;
}

export interface ReceiptRecord {
  id: string;
  receiptNumber: string;
  date: string; // YYYY-MM-DD
  supplier: string;
  items: ReceiptItem[];
  totalAmount: number;
  operator: string;
  notes: string;
  status: 'draft' | 'completed';
  imageUrl?: string; // base64 or object URL of parsed file
  createdAt: string;
  startRowIndex?: number;
  endRowIndex?: number;
  taxAmount?: number;
  taxInclusive?: number;
}

export interface StatsBreakdown {
  totalReceipts: number;
  totalExpenditure: number;
  totalItemsCount: number;
  supplierDistribution: { name: string; count: number; value: number }[];
  monthlyTrend: { month: string; value: number; count: number }[];
}
