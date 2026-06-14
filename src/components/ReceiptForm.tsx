import React, { useState, useEffect } from 'react';
import { ReceiptRecord, ReceiptItem } from '../types';
import { Plus, Trash2, Save, FileText, Calendar, User, Building, AlertCircle, ShoppingCart } from 'lucide-react';

interface ReceiptFormProps {
  receipt?: ReceiptRecord | null; // If editing or reviewing AI parsed values
  onSave: (record: ReceiptRecord) => void;
  onCancel: () => void;
}

const generateId = () => Math.random().toString(36).substring(2, 9);

export default function ReceiptForm({ receipt, onSave, onCancel }: ReceiptFormProps) {
  const [date, setDate] = useState('');
  const [receiptNumber, setReceiptNumber] = useState('');
  const [supplier, setSupplier] = useState('');
  const [operator, setOperator] = useState('');
  const [notes, setNotes] = useState('');
  const [status, setStatus] = useState<'draft' | 'completed'>('completed');
  const [imageUrl, setImageUrl] = useState<string | undefined>(undefined);
  const [items, setItems] = useState<ReceiptItem[]>([]);
  const [validationError, setValidationError] = useState<string | null>(null);

  // Load either existing receipt values (e.g. for edit or AI approval), else initialize empty templates
  useEffect(() => {
    if (receipt) {
      setDate(receipt.date || new Date().toISOString().split('T')[0]);
      setReceiptNumber(receipt.receiptNumber || `RK${new Date().toISOString().replace(/[-:T]/g, '').slice(0, 12)}`);
      setSupplier(receipt.supplier || '');
      setOperator(receipt.operator || '');
      setNotes(receipt.notes || '');
      setStatus(receipt.status || 'completed');
      setImageUrl(receipt.imageUrl);
      // Ensure all items contain secure individual IDs
      setItems(receipt.items ? receipt.items.map(item => ({
        ...item,
        id: item.id || generateId()
      })) : []);
    } else {
      // Create defaults
      setDate(new Date().toISOString().split('T')[0]);
      setReceiptNumber(`RK${new Date().toISOString().replace(/[-:T]/g, '').slice(0, 10)}${Math.floor(Math.random() * 90 + 10)}`);
      setSupplier('');
      setOperator('');
      setNotes('');
      setStatus('completed');
      setImageUrl(undefined);
      // Default with 1 empty item
      setItems([
        {
          id: generateId(),
          code: '',
          name: '',
          specification: '',
          quantity: 1,
          unit: '件',
          unitPrice: 0,
          totalPrice: 0
        }
      ]);
    }
  }, [receipt]);

  // Handle single item field edits
  const handleItemFieldChange = (itemId: string, field: keyof ReceiptItem, val: any) => {
    setItems(prevItems => 
      prevItems.map(item => {
        if (item.id === itemId) {
          const updatedItem = { ...item, [field]: val };
          
          // Auto-calculate multiplication total price 
          if (field === 'quantity' || field === 'unitPrice') {
            const adjustedQty = field === 'quantity' ? Number(val) : item.quantity;
            const adjustedPrice = field === 'unitPrice' ? Number(val) : item.unitPrice;
            updatedItem.totalPrice = Math.round((adjustedQty * adjustedPrice) * 100) / 100;
          }
          return updatedItem;
        }
        return item;
      })
    );
  };

  // Add Item Line Row
  const handleAddItemRow = () => {
    setItems((prev) => [
      ...prev,
      {
        id: generateId(),
        code: '',
        name: '',
        specification: '',
        quantity: 1,
        unit: '件',
        unitPrice: 0,
        totalPrice: 0
      }
    ]);
  };

  // Remove Item Line Row
  const handleRemoveItemRow = (itemId: string) => {
    if (items.length <= 1) {
      setValidationError("明细表至少需要包含一条入库商品项目。");
      return;
    }
    setItems(prev => prev.filter(item => item.id !== itemId));
    setValidationError(null);
  };

  // Handle saving submit
  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setValidationError(null);

    // Form Validations
    if (!receiptNumber.trim()) {
      setValidationError("请输入入库单单号！");
      return;
    }
    if (!date.trim()) {
      setValidationError("请输入入库日期！");
      return;
    }
    if (!supplier.trim()) {
      setValidationError("请输入供货商/供应商名称！");
      return;
    }

    // Validate Items
    const invalidItem = items.find(item => !item.name.trim() || item.quantity <= 0);
    if (invalidItem) {
      setValidationError("请确保货物明细中包含有效品名，且入库数量大于零。");
      return;
    }

    // Aggregate sub prices
    const totalAmount = items.reduce((sum, item) => sum + item.totalPrice, 0);

    const savedRecord: ReceiptRecord = {
      id: receipt?.id || generateId(),
      receiptNumber: receiptNumber.trim(),
      date,
      supplier: supplier.trim(),
      operator: operator.trim(),
      notes: notes.trim(),
      status,
      imageUrl,
      items,
      totalAmount: Math.round(totalAmount * 100) / 100,
      createdAt: receipt?.createdAt || new Date().toISOString()
    };

    onSave(savedRecord);
  };

  // Calculate sum totals
  const computedTotalAmount = items.reduce((sum, item) => sum + item.totalPrice, 0);

  return (
    <form onSubmit={handleSubmit} className="bg-white border border-gray-150 rounded-2xl p-6 space-y-6" id="receipt-entry-form">
      {/* Form Header */}
      <div className="flex justify-between items-center pb-4 border-b border-gray-100">
        <div>
          <h3 className="text-lg font-bold text-gray-900 flex items-center gap-2">
            <span className="p-1 px-1.5 bg-indigo-50 text-indigo-700 rounded-md text-xs font-mono">
              FORM
            </span>
            {receipt?.id ? '编辑/核对入库票据' : '手动增录入库单据'}
          </h3>
          <p className="text-xs text-gray-400 mt-0.5">请确保入库单与原始物料签收单或财审发票数据校对一致。</p>
        </div>
      </div>

      {/* Errors alerting banner */}
      {validationError && (
        <div className="bg-rose-50 border border-rose-150 p-3.5 rounded-xl flex items-start gap-2 text-rose-800 text-xs">
          <AlertCircle size={15} className="shrink-0 mt-0.5" />
          <div>
            <p className="font-bold">输入校验未通过</p>
            <p className="mt-0.5 text-rose-700 font-medium">{validationError}</p>
          </div>
        </div>
      )}

      {/* Grid fields layout */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
        {/* Date picking */}
        <div className="flex flex-col">
          <label className="text-xs font-semibold text-gray-500 mb-1.5 flex items-center gap-2">
            <Calendar size={13} className="text-gray-400" />
            入库日期 *
          </label>
          <input
            type="date"
            value={date}
            onChange={(e) => setDate(e.target.value)}
            className="border border-gray-200 focus:border-indigo-500 focus:ring-1 focus:ring-indigo-100 outline-hidden bg-gray-50/50 p-2.5 rounded-xl text-sm font-semibold text-gray-800"
            required
            id="field-receipt-date"
          />
        </div>

        {/* Receipt Number */}
        <div className="flex flex-col">
          <label className="text-xs font-semibold text-gray-500 mb-1.5 flex items-center gap-2">
            <FileText size={13} className="text-gray-400" />
            入库单号 / 票号 *
          </label>
          <input
            type="text"
            value={receiptNumber}
            onChange={(e) => setReceiptNumber(e.target.value)}
            placeholder="例如: RK2026..."
            className="border border-gray-200 focus:border-indigo-500 focus:ring-1 focus:ring-indigo-100 outline-hidden bg-gray-50/50 p-2.5 rounded-xl text-sm font-semibold text-gray-800 font-mono"
            required
            id="field-receipt-number"
          />
        </div>

        {/* Supplier name */}
        <div className="flex flex-col md:col-span-1 lg:col-span-2">
          <label className="text-xs font-semibold text-gray-500 mb-1.5 flex items-center gap-2">
            <Building size={13} className="text-gray-400" />
            供货商 / 销货单位 *
          </label>
          <input
            type="text"
            value={supplier}
            onChange={(e) => setSupplier(e.target.value)}
            placeholder="供货厂家或贸易商全称"
            className="border border-gray-200 focus:border-indigo-500 focus:ring-1 focus:ring-indigo-100 outline-hidden bg-gray-50/50 p-2.5 rounded-xl text-sm font-semibold text-gray-800"
            required
            id="field-receipt-supplier"
          />
        </div>

        {/* Operator keeper */}
        <div className="flex flex-col">
          <label className="text-xs font-semibold text-gray-500 mb-1.5 flex items-center gap-2">
            <User size={13} className="text-gray-400" />
            仓管员 / 经手人
          </label>
          <input
            type="text"
            value={operator}
            onChange={(e) => setOperator(e.target.value)}
            placeholder="收料签收负责人员"
            className="border border-gray-200 focus:border-indigo-500 focus:ring-1 focus:ring-indigo-100 outline-hidden bg-gray-50/50 p-2.5 rounded-xl text-sm font-semibold text-gray-800"
            id="field-receipt-operator"
          />
        </div>

        {/* Document Status */}
        <div className="flex flex-col">
          <label className="text-xs font-semibold text-gray-500 mb-1.5 flex items-center gap-2">
            单据状态
          </label>
          <div className="flex h-10 bg-gray-100 p-0.5 rounded-xl font-semibold text-xs">
            <button
              type="button"
              onClick={() => setStatus('completed')}
              className={`flex-1 rounded-lg text-center ${
                status === 'completed' ? 'bg-white shadow-xs text-green-700' : 'text-gray-500'
              }`}
            >
              已入库确认
            </button>
            <button
              type="button"
              onClick={() => setStatus('draft')}
              className={`flex-1 rounded-lg text-center ${
                status === 'draft' ? 'bg-white shadow-xs text-amber-700' : 'text-gray-500'
              }`}
            >
              仅草稿暂存
            </button>
          </div>
        </div>

        {/* Notes remark */}
        <div className="flex flex-col md:col-span-2">
          <label className="text-xs font-semibold text-gray-500 mb-1.5 flex items-center gap-2">
            入库说明 / 备注
          </label>
          <input
            type="text"
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            placeholder="特殊存放要求或领用说明"
            className="border border-gray-200 focus:border-indigo-500 focus:ring-1 focus:ring-indigo-100 outline-hidden bg-gray-50/50 p-2.5 rounded-xl text-sm text-gray-850"
            id="field-receipt-notes"
          />
        </div>
      </div>

      {/* Receipt Item Grid Row List */}
      <div>
        <div className="flex justify-between items-center mb-3">
          <h4 className="text-sm font-bold text-gray-800 flex items-center gap-1.5">
            <ShoppingCart size={15} className="text-indigo-600" />
            入库货物商品清单 ({items.length} 行)
          </h4>
          <button
            type="button"
            onClick={handleAddItemRow}
            className="text-xs font-bold text-indigo-700 bg-indigo-50 hover:bg-indigo-100 border border-indigo-200 px-3 py-1.5 rounded-lg flex items-center gap-1 transition-colors"
            id="add-item-row-btn"
          >
            <Plus size={14} />
            <span>添加商品行</span>
          </button>
        </div>

        <div className="border border-gray-150 rounded-xl overflow-hidden bg-gray-50/20">
          <table className="w-full text-left text-xs border-collapse">
            <thead>
              <tr className="bg-gray-50 text-gray-600 font-semibold border-b border-gray-150">
                <th className="py-2.5 px-3 w-[140px]">物料编码</th>
                <th className="py-2.5 px-3 min-w-[180px]">产品/物料名称 *</th>
                <th className="py-2.5 px-3 w-[140px]">规格型号</th>
                <th className="py-2.5 px-3 w-[90px] text-right">入库数量 *</th>
                <th className="py-2.5 px-3 w-[80px] text-center">计量单位</th>
                <th className="py-2.5 px-3 w-[110px] text-right">不含税单价 (铢) *</th>
                <th className="py-2.5 px-3 w-[120px] text-right">不含税总额 (铢)</th>
                <th className="py-2.5 px-3 w-[50px] text-center">操作</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100 text-gray-850">
              {items.map((item, index) => (
                <tr key={item.id} className="hover:bg-white transition-colors">
                  {/* Code */}
                  <td className="py-2 px-3">
                    <input
                      type="text"
                      value={item.code || ''}
                      onChange={(e) => handleItemFieldChange(item.id, 'code', e.target.value)}
                      placeholder="物料编码"
                      className="w-full bg-transparent border-b border-transparent focus:border-indigo-400 outline-hidden pb-0.5 font-mono text-gray-700 text-xs"
                    />
                  </td>

                  {/* Name */}
                  <td className="py-2 px-3">
                    <input
                      type="text"
                      value={item.name}
                      onChange={(e) => handleItemFieldChange(item.id, 'name', e.target.value)}
                      placeholder="物料或商品名称"
                      className="w-full bg-transparent border-b border-transparent focus:border-indigo-400 outline-hidden font-medium text-gray-900 pb-0.5 text-xs"
                      required
                    />
                  </td>

                  {/* Specification */}
                  <td className="py-2 px-3">
                    <input
                      type="text"
                      value={item.specification}
                      onChange={(e) => handleItemFieldChange(item.id, 'specification', e.target.value)}
                      placeholder="规格型号"
                      className="w-full bg-transparent border-b border-transparent focus:border-indigo-400 outline-hidden pb-0.5 font-mono text-gray-600 text-xs"
                    />
                  </td>

                  {/* Quantity */}
                  <td className="py-2 px-3 text-right">
                    <input
                      type="number"
                      step="any"
                      min="0.001"
                      value={item.quantity}
                      onChange={(e) => handleItemFieldChange(item.id, 'quantity', e.target.value)}
                      className="w-full bg-transparent border-b border-transparent focus:border-indigo-400 outline-hidden text-right pb-0.5 font-mono font-bold text-xs"
                      required
                    />
                  </td>

                  {/* Unit */}
                  <td className="py-2 px-3 text-center">
                    <input
                      type="text"
                      value={item.unit}
                      onChange={(e) => handleItemFieldChange(item.id, 'unit', e.target.value)}
                      placeholder="根/件/吨"
                      className="w-full bg-transparent border-b border-transparent focus:border-indigo-400 outline-hidden text-center pb-0.5 font-medium text-xs"
                    />
                  </td>

                  {/* Unit Price */}
                  <td className="py-2 px-3 text-right">
                    <input
                      type="number"
                      step="any"
                      min="0"
                      value={item.unitPrice}
                      onChange={(e) => handleItemFieldChange(item.id, 'unitPrice', e.target.value)}
                      className="w-full bg-transparent border-b border-transparent focus:border-indigo-400 outline-hidden text-right pb-0.5 font-mono text-gray-600 font-semibold text-xs"
                      required
                    />
                  </td>

                  {/* Total Price */}
                  <td className="py-2 px-3 text-right font-bold text-slate-800 font-mono text-xs whitespace-nowrap">
                    ฿{item.totalPrice.toFixed(2)}
                  </td>
                  
                  {/* Action delete */}
                  <td className="py-2 px-3 text-center">
                    <button
                      type="button"
                      onClick={() => handleRemoveItemRow(item.id)}
                      className="p-1 rounded-md text-gray-400 hover:text-rose-600 hover:bg-rose-50 transition-colors"
                      title="删除此行商品"
                    >
                      <Trash2 size={13} />
                    </button>
                  </td>
                </tr>
              ))}
              {/* Grand total summaries footer inside table */}
              <tr className="bg-gray-50/40">
                <td colSpan={6} className="py-2.5 px-3 text-right text-gray-500 font-semibold text-xs">
                  整单不含税金额 (不含税合计)
                </td>
                <td className="py-2.5 px-3 text-right text-xs text-gray-700 font-mono font-bold whitespace-nowrap">
                  ฿{computedTotalAmount.toFixed(2)}
                </td>
                <td></td>
              </tr>
              <tr className="bg-gray-50/40">
                <td colSpan={6} className="py-2.5 px-3 text-right text-gray-500 font-semibold text-xs">
                  7% 税额 (=整单不含税金额 * 0.07)
                </td>
                <td className="py-2.5 px-3 text-right text-xs text-amber-700 font-mono font-bold whitespace-nowrap">
                  ฿{(computedTotalAmount * 0.07).toFixed(2)}
                </td>
                <td></td>
              </tr>
              <tr className="bg-indigo-50/20 font-black">
                <td colSpan={6} className="py-3 px-3 text-right text-indigo-900 font-bold text-xs">
                  含税金额 (=整单不含税金额 + 7%税额)
                </td>
                <td className="py-3 px-3 text-right text-sm text-indigo-700 font-mono font-extrabold whitespace-nowrap">
                  ฿{(computedTotalAmount * 1.07).toFixed(2)}
                </td>
                <td></td>
              </tr>
            </tbody>
          </table>
        </div>
      </div>

      {/* Image thumbnail visual backup preview if attached from AI OCR */}
      {imageUrl && (
        <div className="bg-gray-50 border border-gray-150 p-4 rounded-xl flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-16 h-12 bg-gray-200 rounded-md overflow-hidden relative border border-gray-300">
              <img src={imageUrl} alt="receipt" className="w-full h-full object-cover" referrerPolicy="no-referrer" />
            </div>
            <div>
              <p className="text-xs font-bold text-gray-700">已关联票据扫描件</p>
              <p className="text-[10px] text-gray-400">本单由 AI 自动扫描识别，可随时修改细节纠错。</p>
            </div>
          </div>
          <button
            type="button"
            onClick={() => setImageUrl(undefined)}
            className="text-xs font-bold text-rose-600 hover:text-rose-700 hover:bg-rose-50 px-2.5 py-1 rounded-lg border border-rose-100 transition-colors"
          >
            断开图片关联
          </button>
        </div>
      )}

      {/* Save / Cancel controls */}
      <div className="flex items-center justify-end gap-3 pt-2">
        <button
          type="button"
          onClick={onCancel}
          className="px-4 py-2.5 rounded-xl border border-gray-250 hover:bg-gray-50 text-xs font-bold text-gray-600 transition-colors"
          id="detail-cancel-form-btn"
        >
          取消返回
        </button>
        <button
          type="submit"
          className="bg-indigo-600 hover:bg-indigo-700 text-white font-bold text-xs p-2.5 px-5 rounded-xl flex items-center gap-1.5 shadow-sm transition-colors"
          id="detail-save-form-btn"
        >
          <Save size={14} />
          <span>保存入库票据</span>
        </button>
      </div>
    </form>
  );
}
