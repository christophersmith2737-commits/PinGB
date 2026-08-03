// 下载网格的选项类型定义
export type GridDownloadOptions = {
  showGrid: boolean;
  coarseGridInterval: number;  // 粗线间隔（可调）
  fineGridInterval: number;    // 细线间隔（自动 = 粗线/2）
  showCoordinates: boolean;
  showCellNumbers: boolean;
  gridLineColor: string;
  includeStats: boolean;
  exportCsv: boolean; // 新增：是否同时导出CSV hex数据
};
