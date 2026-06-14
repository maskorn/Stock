import { ReceiptRecord } from '../types';

export const initialMockReceipts: ReceiptRecord[] = [
  {
    id: 'rec-1',
    receiptNumber: 'RK2026060105',
    date: '2026-06-01',
    supplier: '飞凡数码科技有限公司',
    operator: '张仓管',
    notes: '核心机房服务器迭代与交换机备用件入库。',
    status: 'completed',
    createdAt: '2026-06-01T09:30:00.000Z',
    items: [
      {
        id: 'item-1-1',
        name: '企业级交换机',
        specification: 'TL-SG3428X (24口万兆)',
        quantity: 4,
        unit: '台',
        unitPrice: 1850.00,
        totalPrice: 7400.00
      },
      {
        id: 'item-1-2',
        name: '光纤收发模块',
        specification: 'SFP+ 10G 单模双纤 10km',
        quantity: 20,
        unit: '个',
        unitPrice: 120.00,
        totalPrice: 2400.00
      },
      {
        id: 'item-1-3',
        name: '超六类屏蔽网线',
        specification: 'CAT6A 3米 灰蓝',
        quantity: 50,
        unit: '根',
        unitPrice: 15.00,
        totalPrice: 750.00
      }
    ],
    totalAmount: 10550.00
  },
  {
    id: 'rec-2',
    receiptNumber: 'RK20260608112',
    date: '2026-06-08',
    supplier: '东星不锈钢五金工业制品厂',
    operator: '李收发',
    notes: '车间扩充模具五金配件，要求密封圈防腐蚀。',
    status: 'completed',
    createdAt: '2026-06-08T14:15:22.000Z',
    items: [
      {
        id: 'item-2-1',
        name: '不锈钢紧固垫圈',
        specification: 'M12-SS316 加厚款',
        quantity: 1500,
        unit: '个',
        unitPrice: 0.85,
        totalPrice: 1275.00
      },
      {
        id: 'item-2-2',
        name: '高压油封弹簧圈',
        specification: 'TC-50*72*10 丁腈橡胶',
        quantity: 50,
        unit: '只',
        unitPrice: 12.50,
        totalPrice: 625.00
      }
    ],
    totalAmount: 1900.00
  },
  {
    id: 'rec-3',
    receiptNumber: 'RK20260612140',
    date: '2026-06-12',
    supplier: '宏远化工新材料有限公司',
    operator: '张仓管',
    notes: '喷涂车间底漆和稀释溶剂到货验收，注意防爆保存。',
    status: 'draft',
    createdAt: '2026-06-12T10:45:00.000Z',
    items: [
      {
        id: 'item-3-1',
        name: '环氧树脂抗腐蚀底漆',
        specification: 'EP-12 铁红色 (20kg/桶)',
        quantity: 35,
        unit: '桶',
        unitPrice: 380.00,
        totalPrice: 13300.00
      },
      {
        id: 'item-3-2',
        name: '专用高能稀释剂',
        specification: 'TH-9 化工环保配级 (15kg/桶)',
        quantity: 12,
        unit: '桶',
        unitPrice: 195.00,
        totalPrice: 2340.00
      }
    ],
    totalAmount: 15640.00
  }
];
