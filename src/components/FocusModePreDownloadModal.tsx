'use client';

import React from 'react';
import { MappedPixel } from '../utils/pixelation';
import { ColorSystem } from '../utils/pixelation';
import { exportCsvData } from '../utils/imageDownloader';

interface FocusModePreDownloadModalProps {
  isOpen: boolean;
  onClose: () => void;
  onProceedWithoutDownload: () => void;
  mappedPixelData: MappedPixel[][] | null;
  gridDimensions: { N: number; M: number } | null;
  selectedColorSystem: ColorSystem;
}

const FocusModePreDownloadModal: React.FC<FocusModePreDownloadModalProps> = ({
  isOpen,
  onClose,
  onProceedWithoutDownload,
  mappedPixelData,
  gridDimensions,
  selectedColorSystem,
}) => {
  if (!isOpen) return null;

  const handleDownloadAndProceed = () => {
    exportCsvData({
      mappedPixelData,
      gridDimensions,
      selectedColorSystem,
    });
    // 等一下让下载开始，然后进入辅助高效拼豆模式
    setTimeout(() => {
      onProceedWithoutDownload();
    }, 500);
  };

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 backdrop-blur-sm z-50 flex justify-center items-center p-4">
      <div className="bg-white dark:bg-gray-800 rounded-2xl shadow-2xl max-w-md w-full p-6">
        <h2 className="text-xl font-bold text-gray-900 dark:text-gray-100 mb-3">
          进入辅助高效拼豆模式
        </h2>

        <div className="bg-amber-50 dark:bg-amber-900/30 border border-amber-200 dark:border-amber-700 rounded-lg p-4 mb-5">
          <p className="text-sm text-amber-800 dark:text-amber-200 leading-relaxed">
            进入辅助高效拼豆模式后，您将无法返回到当前的编辑界面。建议您先下载当前的数据文件（CSV格式）保存，以便日后重新导入使用。
          </p>
        </div>

        <div className="space-y-3">
          <button
            onClick={handleDownloadAndProceed}
            className="w-full py-3 px-4 rounded-xl font-semibold text-white
                       bg-gradient-to-r from-emerald-500 to-cyan-600
                       hover:from-emerald-600 hover:to-cyan-700
                       transition-all duration-200 shadow-lg"
          >
            📥 下载档案并进入
          </button>

          <button
            onClick={onProceedWithoutDownload}
            className="w-full py-3 px-4 rounded-xl font-semibold
                       text-gray-700 dark:text-gray-200
                       bg-gray-100 dark:bg-gray-700
                       hover:bg-gray-200 dark:hover:bg-gray-600
                       transition-all duration-200"
          >
            直接进入（不下载）
          </button>

          <button
            onClick={onClose}
            className="w-full py-3 px-4 rounded-xl font-medium
                       text-gray-500 dark:text-gray-400
                       hover:text-gray-700 dark:hover:text-gray-200
                       transition-all duration-200"
          >
            取消
          </button>
        </div>
      </div>
    </div>
  );
};

export default FocusModePreDownloadModal;
