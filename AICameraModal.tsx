import React from 'react';
import { ResponsiveContainer, AreaChart, Area, XAxis, YAxis, Tooltip, BarChart, Bar, Cell, Legend } from 'recharts';
import { ReceiptRecord, ReceiptItem } from '../types';
import { TrendingUp, Package, Users, Receipt } from 'lucide-react';

interface ReceiptStatsProps {
  records: ReceiptRecord[];
}

export default function ReceiptStats({ records }: ReceiptStatsProps) {
  // 1. Calculate active statistics
  const totalReceipts = records.length;
  const totalExpenditure = records.reduce((sum, r) => sum + r.totalAmount, 0);

  // Group unique goods names
  const uniqueItems = new Set<string>();
  let totalItemsCount = 0;
  records.forEach((r) => {
    r.items.forEach((item) => {
      if (item.name) {
        uniqueItems.add(item.name.toLowerCase().trim());
        totalItemsCount += item.quantity;
      }
    });
  });

  // Unique suppliers count
  const uniqueSuppliers = new Set(records.map(r => r.supplier.trim()));

  // 2. Prepare Dynamic charts analysis datasets
  // Group by Supplier Cost distribution
  const supplierSums: { [key: string]: { value: number; count: number } } = {};
  records.forEach((r) => {
    const sName = r.supplier || '未知公司';
    if (!supplierSums[sName]) {
      supplierSums[sName] = { value: 0, count: 0 };
    }
    supplierSums[sName].value += r.totalAmount;
    supplierSums[sName].count += 1;
  });

  const supplierData = Object.entries(supplierSums)
    .map(([name, stat]) => ({
      name,
      金额: Math.round(stat.value * 100) / 100,
      单数: stat.count
    }))
    .sort((a, b) => b.金额 - a.金额)
    .slice(0, 5); // top 5 suppliers

  // Group by Monthly / Daily trends dataset
  // Let's group by date to show a trend
  const dateSums: { [key: string]: { value: number; count: number } } = {};
  records.forEach((r) => {
    const rawDate = r.date || 'unknown';
    // Format to simple date representation
    if (!dateSums[rawDate]) {
      dateSums[rawDate] = { value: 0, count: 0 };
    }
    dateSums[rawDate].value += r.totalAmount;
    dateSums[rawDate].count += 1;
  });

  const trendData = Object.entries(dateSums)
    .map(([date, stat]) => ({
      date,
      "入库总额": Math.round(stat.value * 100) / 100,
      "单数": stat.count
    }))
    .sort((a, b) => a.date.localeCompare(b.date));

  // Colorful array for visual flair in chart bars
  const COLORS = ['#4f46e5', '#06b6d4', '#10b981', '#f59e0b', '#ec4899'];

  return (
    <div className="space-y-6" id="stats-dashboard-container">
      {/* Metrics Row */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        {/* Core Card 1 */}
        <div className="bg-white border border-gray-150 p-5 rounded-2xl flex items-center gap-4 hover:shadow-xs transition-shadow">
          <div className="p-3.5 bg-indigo-50 text-indigo-600 rounded-xl">
            <Receipt size={22} />
          </div>
          <div>
            <p className="text-xs font-semibold text-gray-400">入库单据总排数</p>
            <p className="text-2xl font-black text-gray-900 font-mono tracking-tight mt-0.5">{totalReceipts}</p>
          </div>
        </div>

        {/* Core Card 2 */}
        <div className="bg-white border border-gray-150 p-5 rounded-2xl flex items-center gap-4 hover:shadow-xs transition-shadow">
          <div className="p-3.5 bg-emerald-50 text-emerald-600 rounded-xl">
            <TrendingUp size={22} />
          </div>
          <div>
            <p className="text-xs font-semibold text-gray-400">入库票据总资金</p>
            <p className="text-2xl font-black text-emerald-700 font-mono tracking-tight mt-0.5">
              ฿{totalExpenditure.toLocaleString('zh-CN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
            </p>
          </div>
        </div>

        {/* Core Card 3 */}
        <div className="bg-white border border-gray-150 p-5 rounded-2xl flex items-center gap-4 hover:shadow-xs transition-shadow">
          <div className="p-3.5 bg-cyan-50 text-cyan-600 rounded-xl">
            <Package size={22} />
          </div>
          <div>
            <p className="text-xs font-semibold text-gray-400">货物种类/数量</p>
            <p className="text-2xl font-black text-gray-900 font-mono tracking-tight mt-0.5">
              {uniqueItems.size} <span className="text-xs font-normal text-gray-400">类</span> / {totalItemsCount} <span className="text-xs font-normal text-gray-400">件</span>
            </p>
          </div>
        </div>

        {/* Core Card 4 */}
        <div className="bg-white border border-gray-150 p-5 rounded-2xl flex items-center gap-4 hover:shadow-xs transition-shadow">
          <div className="p-3.5 bg-amber-50 text-amber-600 rounded-xl">
            <Users size={22} />
          </div>
          <div>
            <p className="text-xs font-semibold text-gray-400">已对接供应商</p>
            <p className="text-2xl font-black text-gray-900 font-mono tracking-tight mt-0.5">{uniqueSuppliers.size}</p>
          </div>
        </div>
      </div>

      {/* Charts Section */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Expenditure trend */}
        <div className="bg-white border border-gray-150 p-5 rounded-2xl flex flex-col h-[320px]">
          <div className="mb-4">
            <h4 className="text-sm font-bold text-gray-800 flex items-center gap-2">
              <span className="w-1 h-3.5 bg-indigo-500 rounded-xs"></span>
              入库金额走势图 (按日期排)
            </h4>
          </div>
          <div className="flex-1 w-full h-full min-h-0">
            {trendData.length > 0 ? (
              <ResponsiveContainer width="100%" height="100%">
                <AreaChart data={trendData} margin={{ top: 5, right: 5, left: -20, bottom: 0 }}>
                  <defs>
                    <linearGradient id="colorValue" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="5%" stopColor="#4f46e5" stopOpacity={0.2}/>
                      <stop offset="95%" stopColor="#4f46e5" stopOpacity={0}/>
                    </linearGradient>
                  </defs>
                  <XAxis dataKey="date" tickStyle={{ fontSize: 10, fill: '#64748b' }} axisLine={false} tickLine={false} />
                  <YAxis tickStyle={{ fontSize: 10, fill: '#64748b' }} axisLine={false} tickLine={false} />
                  <Tooltip 
                    contentStyle={{ borderRadius: '12px', border: '1px solid #e2e8f0', fontSize: '12px' }} 
                    formatter={(value: any) => [`฿${value}`, '入库资金']}
                  />
                  <Area type="monotone" dataKey="入库总额" stroke="#4f46e5" strokeWidth={2.5} fillOpacity={1} fill="url(#colorValue)" />
                </AreaChart>
              </ResponsiveContainer>
            ) : (
              <div className="h-full flex items-center justify-center text-gray-400 text-xs">
                暂无足够走势数据
              </div>
            )}
          </div>
        </div>

        {/* Supplier distribution */}
        <div className="bg-white border border-gray-150 p-5 rounded-2xl flex flex-col h-[320px]">
          <div className="mb-4">
            <h4 className="text-sm font-bold text-gray-800 flex items-center gap-2">
              <span className="w-1 h-3.5 bg-cyan-500 rounded-xs"></span>
              供应商供料排行 (Top 5 金额占比)
            </h4>
          </div>
          <div className="flex-1 w-full h-full min-h-0">
            {supplierData.length > 0 ? (
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={supplierData} margin={{ top: 5, right: 5, left: -20, bottom: 0 }}>
                  <XAxis dataKey="name" tickStyle={{ fontSize: 10, fill: '#64748b' }} axisLine={false} tickLine={false} tickFormatter={(v) => v.slice(0, 6) + '...'} />
                  <YAxis tickStyle={{ fontSize: 10, fill: '#64748b' }} axisLine={false} tickLine={false} />
                  <Tooltip 
                    contentStyle={{ borderRadius: '12px', border: '1px solid #e2e8f0', fontSize: '11px' }} 
                    formatter={(value: any) => [`฿${value}`, '总额']}
                  />
                  <Bar dataKey="金额" radius={[4, 4, 0, 0]} maxBarSize={45}>
                    {supplierData.map((entry, index) => (
                      <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />
                    ))}
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            ) : (
              <div className="h-full flex items-center justify-center text-gray-400 text-xs">
                暂无足够排行数据
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
