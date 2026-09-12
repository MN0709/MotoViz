import type { PossibleCause, Reference } from '@motorcycle-ai/shared';

export interface FaultCase {
  id: string;
  symptoms: string[];
  motorcycleModels: string[];
  diagnosis: string;
  possibleCauses: PossibleCause[];
  references: Reference[];
}

export const faultCases: FaultCase[] = [
  {
    id: 'fault-001', symptoms: ['冷车启动困难', '怠速熄火'], motorcycleModels: ['川崎 Ninja 400 2018-2023'], diagnosis: '优先检查蓄电池静态电压、怠速控制通道和火花塞状态。',
    possibleCauses: [
      { cause: '蓄电池电压偏低', probability: 0.72, solution: '静置后测量电压；低于维修手册阈值时充电并做负载测试。' },
      { cause: '节气门体或怠速空气通道积碳', probability: 0.61, solution: '按手册拆检并清洁节气门体，完成怠速学习。' },
    ],
    references: [{ title: 'Ninja 400 服务手册：燃油系统', sourceType: 'manual', excerpt: '冷启动异常应先确认电池状态，再检查怠速控制与点火系统。', url: 'https://example.com/manuals/ninja400/fuel-system#cold-start' }],
  },
  {
    id: 'fault-002', symptoms: ['加速无力', '高转顿挫'], motorcycleModels: ['雅马哈 YZF-R3 2019-2024'], diagnosis: '症状与供油不足或空气滤芯堵塞相符，应由易到难排查。',
    possibleCauses: [{ cause: '空气滤芯堵塞', probability: 0.68, solution: '检查滤芯污染程度并按周期更换。' }, { cause: '燃油泵压力不足', probability: 0.46, solution: '连接燃油压力表并与维修手册标准值对比。' }],
    references: [{ title: 'YZF-R3 服务手册：发动机性能', sourceType: 'manual', excerpt: '高转动力不足时检查进气阻力和燃油压力。', url: 'https://example.com/manuals/r3/engine-performance' }],
  },
  {
    id: 'fault-003', symptoms: ['刹车手感变软', '制动距离变长'], motorcycleModels: ['本田 CB500X 2019-2023'], diagnosis: '先停止激烈驾驶，检查制动液液位、管路泄漏和系统内空气。',
    possibleCauses: [{ cause: '制动管路进入空气', probability: 0.76, solution: '检查泄漏后按规定顺序排气并更换合规制动液。' }],
    references: [{ title: 'CB500X 服务手册：液压制动', sourceType: 'manual', excerpt: '手柄行程异常增大时应检查泄漏并排出液压系统空气。', url: 'https://example.com/manuals/cb500x/brakes' }],
  },
  {
    id: 'fault-004', symptoms: ['链条异响', '收油顿挫'], motorcycleModels: ['KTM Duke 390 2021-2024'], diagnosis: '检查链条松弛量、润滑状态以及前后链轮磨损。',
    possibleCauses: [{ cause: '链条过松或润滑不足', probability: 0.81, solution: '按手册测量并调整松弛量，清洁后使用摩托车链条润滑剂。' }],
    references: [{ title: 'Duke 390 用户手册：传动链条', sourceType: 'manual', excerpt: '链条松弛量应在规定位置和载荷状态下测量。', url: 'https://example.com/manuals/duke390/drive-chain' }],
  },
  {
    id: 'fault-005', symptoms: ['水温过高', '风扇不转'], motorcycleModels: ['川崎 Z400 2019-2023'], diagnosis: '立即避免继续高负荷行驶，依次检查冷却液、保险丝、风扇继电器和温度传感器。',
    possibleCauses: [{ cause: '风扇保险丝或继电器故障', probability: 0.7, solution: '断电后检查保险丝和继电器，不得用更大额定电流保险丝替代。' }],
    references: [{ title: 'Z400 服务手册：冷却系统', sourceType: 'manual', excerpt: '风扇不工作时先检查保险丝、继电器及风扇电机供电。', url: 'https://example.com/manuals/z400/cooling' }],
  },
  {
    id: 'fault-006', symptoms: ['前轮抖动', '高速摆头'], motorcycleModels: ['雅马哈 MT-07 2021-2024'], diagnosis: '该症状存在安全风险，应检查胎压、轮胎磨损、轮圈动平衡和转向轴承。',
    possibleCauses: [{ cause: '胎压异常或轮胎不均匀磨损', probability: 0.63, solution: '冷胎测压并检查轮胎变形；异常时停止高速骑行。' }],
    references: [{ title: 'MT-07 服务手册：转向与前轮', sourceType: 'manual', excerpt: '出现转向摆动时需检查轮胎、车轮平衡和转向轴承。', url: 'https://example.com/manuals/mt07/steering' }],
  },
  {
    id: 'fault-007', symptoms: ['离合打滑', '转速升高车速不升'], motorcycleModels: ['凯旋 Trident 660 2021-2024'], diagnosis: '检查离合拉索自由行程、机油规格和摩擦片磨损。',
    possibleCauses: [{ cause: '离合拉索自由行程不足', probability: 0.66, solution: '按手册调整手柄端与发动机端自由行程。' }, { cause: '摩擦片磨损', probability: 0.52, solution: '拆检摩擦片厚度和平面度，超限则成套更换。' }],
    references: [{ title: 'Trident 660 Workshop Manual：Clutch', sourceType: 'manual', excerpt: 'Clutch slip diagnosis begins with cable free play and approved oil specification.', url: 'https://example.com/manuals/trident660/clutch' }],
  },
  {
    id: 'fault-008', symptoms: ['电瓶反复亏电', '行驶中仪表变暗'], motorcycleModels: ['本田 CBR500R 2019-2023'], diagnosis: '检查静态漏电、发电机定子输出和整流调节器充电电压。',
    possibleCauses: [{ cause: '整流调节器充电异常', probability: 0.64, solution: '按规定转速测量电池端充电电压，并检查插头烧蚀。' }],
    references: [{ title: 'CBR500R 服务手册：充电系统', sourceType: 'manual', excerpt: '充电故障诊断包含蓄电池、漏电电流、定子线圈和调节器检查。', url: 'https://example.com/manuals/cbr500r/charging' }],
  },
  {
    id: 'fault-009', symptoms: ['排气放炮', '松油门回火'], motorcycleModels: ['杜卡迪 Monster 937 2021-2024'], diagnosis: '检查排气接口漏气、二次进气系统和燃油修正，不应直接更换 ECU。',
    possibleCauses: [{ cause: '排气连接处漏气', probability: 0.58, solution: '冷车检查接口密封和紧固扭矩，必要时更换垫片。' }],
    references: [{ title: 'Monster 937 Workshop Manual：Exhaust', sourceType: 'manual', excerpt: 'Exhaust leakage can cause popping during deceleration.', url: 'https://example.com/manuals/monster937/exhaust' }],
  },
  {
    id: 'fault-010', symptoms: ['减震漏油', '前叉触底'], motorcycleModels: ['宝马 R 1250 GS 2019-2024'], diagnosis: '检查油封、内管划伤和设定载荷；漏油污染制动部件时应停止骑行。',
    possibleCauses: [{ cause: '前叉油封损坏', probability: 0.79, solution: '清洁确认漏点，检查内管后成对更换油封与规定规格前叉油。' }],
    references: [{ title: 'R 1250 GS 维修说明：前悬挂', sourceType: 'manual', excerpt: '发现前叉油泄漏时需检查密封件和滑动管表面损伤。', url: 'https://example.com/manuals/r1250gs/front-suspension' }],
  },
];
