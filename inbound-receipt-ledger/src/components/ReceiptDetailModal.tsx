import React from 'react';
import { ReceiptRecord } from '../types';
import { X, Calendar, User, FileText, CheckCircle, Clock, Building, Download, Printer } from 'lucide-react';

interface ReceiptDetailModalProps {
  receipt: ReceiptRecord;
  onClose: () => void;
  onExportSingle?: (receipt: ReceiptRecord) => void;
}

export default function ReceiptDetailModal({ receipt, onClose, onExportSingle }: ReceiptDetailModalProps) {
  // Simple print handler
  const handlePrint = () => {
    window.print();
  };

  return (
    <div className="fixed inset-0 bg-gray-900/60 backdrop-blur-xs flex items-center justify-center p-4 z-50 animate-fade-in" id="receipt-detail-backdrop">
      <div 
        className="bg-white rounded-2xl shadow-xl w-full max-w-3xl overflow-hidden flex flex-col max-h-[90vh]"
        id={`receipt-modal-${receipt.id}`}
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="p-6 border-b border-gray-100 flex items-center justify-between bg-gray-50/50">
          <div>
            <div className="flex items-center gap-3">
              <span className="text-xs font-mono bg-gray-100 text-gray-600 px-2.5 py-1 rounded-md font-semibold">
                入库票据详情
              </span>
              <span className={`inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-xs font-medium ${
                receipt.status === 'completed' 
                  ? 'bg-green-50 text-green-700 border border-green-200' 
                  : 'bg-amber-50 text-amber-700 border border-amber-200'
              }`}>
                {receipt.status === 'completed' ? <CheckCircle size={12} /> : <Clock size={12} />}
                {receipt.status === 'completed' ? '已完成入库' : '暂存草稿'}
              </span>
            </div>
            <h3 className="text-xl font-bold text-gray-900 mt-1.5 font-mono">
              单号: {receipt.receiptNumber}
            </h3>
          </div>
          <button 
            onClick={onClose}
            className="p-1.5 rounded-lg text-gray-400 hover:text-gray-500 hover:bg-gray-100 transition-colors"
            id="close-detail-modal-btn"
          >
            <X size={20} />
          </button>
        </div>

        {/* Content */}
        <div className="p-6 overflow-y-auto space-y-6 flex-1 print:p-0">
          {/* Metadata Grid */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4 bg-gray-50 p-4 rounded-xl">
            <div className="flex items-center gap-3">
              <div className="p-2 bg-white rounded-lg border border-gray-100 text-gray-500">
                <Calendar size={18} />
              </div>
              <div>
                <p className="text-xs text-gray-400 font-medium">入库日期</p>
                <p className="text-sm font-semibold text-gray-800">{receipt.date}</p>
              </div>
            </div>

            <div className="flex items-center gap-3">
              <div className="p-2 bg-white rounded-lg border border-gray-100 text-gray-500">
                <Building size={18} />
              </div>
              <div>
                <p className="text-xs text-gray-400 font-medium">供应商 / 销货商</p>
                <p className="text-sm font-semibold text-gray-800 line-clamp-1">{receipt.supplier}</p>
              </div>
            </div>

            <div className="flex items-center gap-3">
              <div className="p-2 bg-white rounded-lg border border-gray-100 text-gray-500">
                <User size={18} />
              </div>
              <div>
                <p className="text-xs text-gray-400 font-medium">经办人 / 仓管员</p>
                <p className="text-sm font-semibold text-gray-800">{receipt.operator || '未指定'}</p>
              </div>
            </div>

            <div className="flex items-center gap-3">
              <div className="p-2 bg-white rounded-lg border border-gray-100 text-gray-500">
                <FileText size={18} />
              </div>
              <div>
                <p className="text-xs text-gray-400 font-medium">录入时间</p>
                <p className="text-sm font-semibold text-gray-800">
                  {new Date(receipt.createdAt).toLocaleString('zh-CN', { hour12: false })}
                </p>
              </div>
            </div>
          </div>

          {/* Table Items */}
          <div>
            <h4 className="text-sm font-bold text-gray-900 mb-3 flex items-center gap-2">
              <span className="w-1.5 h-3.5 bg-indigo-600 rounded-sm"></span>
              货物明细清单 ({receipt.items.length})
            </h4>
            <div className="border border-gray-150 rounded-xl overflow-hidden">
              <table className="w-full text-left text-sm border-collapse">
                <thead>
                  <tr className="bg-gray-50 font-medium text-gray-600 border-b border-gray-150 text-xs">
                    <th className="py-2.5 px-4">物料编码</th>
                    <th className="py-2.5 px-4 font-bold">物料名称</th>
                    <th className="py-2.5 px-4">规格型号</th>
                    <th className="py-2.5 px-4 text-right">数量</th>
                    <th className="py-2.5 px-4 text-center">单位</th>
                    <th className="py-2.5 px-4 text-right">不含税单价</th>
                    <th className="py-2.5 px-4 text-right">不含税金额</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100 text-xs text-gray-700">
                  {receipt.items.map((item, index) => (
                    <tr key={item.id} className="hover:bg-gray-50/50">
                      <td className="py-3 px-4 font-mono text-gray-500">{item.code || '-'}</td>
                      <td className="py-3 px-4 font-bold text-gray-900">{item.name}</td>
                      <td className="py-3 px-4 text-gray-500 font-mono">{item.specification || '-'}</td>
                      <td className="py-3 px-4 text-right font-semibold font-mono">{item.quantity}</td>
                      <td className="py-3 px-4 text-center text-gray-500">{item.unit || '件'}</td>
                      <td className="py-3 px-4 text-right font-mono text-gray-600">฿{item.unitPrice.toFixed(2)}</td>
                      <td className="py-3 px-4 text-right font-semibold font-mono text-indigo-700">฿{item.totalPrice.toFixed(2)}</td>
                    </tr>
                  ))}
                  <tr className="bg-gray-50/30">
                    <td colSpan={6} className="py-2 px-4 font-semibold text-right text-gray-500">
                      整单不含税金额 (不含税合计)
                    </td>
                    <td className="py-2 px-4 text-right font-bold font-mono text-gray-800">
                      ฿{receipt.totalAmount.toFixed(2)}
                    </td>
                  </tr>
                  <tr className="bg-gray-50/30">
                    <td colSpan={6} className="py-2 px-4 font-semibold text-right text-gray-500">
                      7% 税额 (=整单不含税金额 * 0.07)
                    </td>
                    <td className="py-2 px-4 text-right font-bold font-mono text-amber-700">
                      ฿{(receipt.totalAmount * 0.07).toFixed(2)}
                    </td>
                  </tr>
                  <tr className="bg-indigo-50/30 font-black">
                    <td colSpan={6} className="py-3 px-4 font-bold text-right text-indigo-950">
                      含税金额 (=整单不含税金额 + 7%税额)
                    </td>
                    <td className="py-3 px-4 text-right font-bold font-mono text-indigo-800 text-sm">
                      ฿{(receipt.totalAmount * 1.07).toFixed(2)}
                    </td>
                  </tr>
                </tbody>
              </table>
            </div>
          </div>

          {/* Notes Card */}
          {receipt.notes && (
            <div className="bg-amber-50/40 border border-amber-100 p-4 rounded-xl">
              <p className="text-xs font-bold text-amber-800 uppercase tracking-wider mb-1">备注说明</p>
              <p className="text-sm text-amber-900">{receipt.notes}</p>
            </div>
          )}

          {/* Receipt Scanned File Preview if uploaded */}
          {receipt.imageUrl && (
            <div className="border border-gray-100 rounded-xl p-4">
              <p className="text-xs font-bold text-gray-400 uppercase tracking-wider mb-2">票证图像备份</p>
              <div className="bg-gray-100 rounded-lg overflow-hidden flex items-center justify-center p-2 max-h-[220px]">
                <img 
                  src={receipt.imageUrl} 
                  alt="Receipt backup" 
                  className="max-h-[200px] object-contain rounded-md shadow-sm pointer-events-none"
                  referrerPolicy="no-referrer"
                />
              </div>
            </div>
          )}
        </div>

        {/* Footer Actions */}
        <div className="p-4 border-t border-gray-100 bg-gray-50 flex items-center justify-between gap-3 shrink-0">
          <button
            onClick={handlePrint}
            className="flex items-center gap-2 px-3 py-2 text-sm text-gray-600 hover:text-gray-800 hover:bg-gray-100 rounded-lg transition-colors"
            id="print-single-btn"
          >
            <Printer size={16} />
            <span>打印单据</span>
          </button>

          <div className="flex gap-2">
            {onExportSingle && (
              <button
                onClick={() => onExportSingle(receipt)}
                className="flex items-center gap-2 px-4 py-2 text-sm bg-indigo-50 text-indigo-700 hover:bg-indigo-100 rounded-lg transition-colors font-medium"
                id="export-single-btn"
              >
                <Download size={16} />
                <span>单张导出</span>
              </button>
            )}
            <button
              onClick={onClose}
              className="px-5 py-2 text-sm text-gray-700 hover:text-gray-900 bg-white border border-gray-200 hover:border-gray-300 rounded-lg transition-colors font-medium"
              id="close-detail-modal-btn-footer"
            >
              关闭
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
