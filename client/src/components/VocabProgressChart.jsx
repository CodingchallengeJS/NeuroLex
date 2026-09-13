import React from 'react';
import { useState, useEffect, useContext } from 'react';
import { useNavigate } from 'react-router-dom';
import Chart from 'react-apexcharts';
import { ThemeContext } from '../context/ThemeContext';

// ApexCharts draws SVG attributes, which cannot use CSS variables, so the text,
// grid and tooltip colours are picked here per theme.
const CHART_THEMES = {
  dark: { text: '#ffffff', muted: '#9ca3af', grid: '#374151', stroke: '#0f172a', unlearned: '#374151', tooltip: 'dark' },
  light: { text: '#1a2a40', muted: '#5b708b', grid: '#d3dff0', stroke: '#ffffff', unlearned: '#cbd5e1', tooltip: 'light' }
};

export default function VocabularyProgressChart({ summary, total_words, onStartReview, selected_nb }) {
  const [selectedNb, setSelectedNb] = useState(selected_nb || null);
  const [view, setView] = useState('bar');
  const { resolvedTheme } = useContext(ThemeContext);
  const ink = CHART_THEMES[resolvedTheme] || CHART_THEMES.dark;

  useEffect(() => {
    if(selectedNb != selected_nb) {
      setSelectedNb(selected_nb);
    }
  }, [selected_nb]);

  // Fallback an toàn
  const data = summary || { due_now: 0, due_1: 0, due_3: 0, due_7: 0, due_14: 0, mastered: 0 };

  const navigate = useNavigate();
  const handleStartReview = (bucket) => {
    let url = `/quiz/${bucket}`;
    if (selectedNb) url += `?notebook_id=${selectedNb}`;
    navigate(url);
  };

  // 1. Tính tổng số từ ĐANG TRONG CHU KỲ HỌC
  const learningCount =
    (data.due_now || 0) +
    (data.due_1 || 0) +
    (data.due_3 || 0) +
    (data.due_7 || 0) +
    (data.due_14 || 0) +
    (data.mastered || 0);

  // 2. Tổng số từ toàn hệ thống
  const totalWords = total_words || 0;

  // 3. Số từ CHƯA HỌC
  const unlearnedCount = Math.max(0, totalWords - learningCount);

  // 4. Mảng dữ liệu cho Donut Chart
  const series = [
    data.due_now || 0,
    data.due_1 || 0,
    data.due_3 || 0,
    data.due_7 || 0,
    data.due_14 || 0,
    data.mastered || 0,
    unlearnedCount
  ];

  const totalLearningWords = learningCount;

  const labels = ['Ôn tập ngay', 'Ngày mai', '3 ngày', '7 ngày', '14 ngày', 'Nhớ sâu', 'Chưa học'];
  const colors = ['#ef4444', '#f97316', '#eab308', '#22c55e', '#06b6d4', '#8b5cf6', ink.unlearned];

  // --- CẤU HÌNH DONUT CHART (Giữ nguyên của bạn) ---
  const donutOptions = {
    chart: {
      type: 'donut',
      foreColor: ink.muted,
      animations: { enabled: true, easing: 'easeinout', speed: 800 },
    },
    colors: colors,
    labels: labels,
    stroke: { show: true, colors: [ink.stroke], width: 1 },
    dataLabels: { enabled: false },
    legend: { show: false },
    tooltip: {
      enabled: true,
      theme: ink.tooltip,
      y: {
        formatter: function (value) {
          const percent = totalWords > 0 ? Math.round((value / totalWords) * 100) : 0;
          return `${value} từ (${percent}%)`;
        }
      }
    },
    plotOptions: {
      pie: {
        expandOnClick: true,
        donut: {
          size: '75%',
          labels: {
            show: true,
            name: { show: true, color: ink.muted, fontSize: '13px', fontFamily: 'Inter, sans-serif' },
            value: {
              show: true,
              color: ink.text,
              fontSize: '22px',
              fontWeight: '700',
              fontFamily: 'Inter, sans-serif',
              formatter: function (val) {
                const num = parseInt(val, 10);
                const pct = totalWords > 0 ? Math.round((num / totalWords) * 100) : 0;
                return `${num} (${pct}%)`;
              }
            },
            total: {
              show: true,
              showAlways: true,
              label: 'Đã học',
              color: ink.muted,
              fontSize: '13px',
              fontFamily: 'Inter, sans-serif',
              formatter: function () {
                return `${totalLearningWords}/${totalWords} từ`;
              }
            }
          }
        }
      }
    }
  };

  // --- CẤU HÌNH BAR CHART MỚI ---
  // Chỉ lấy 6 thành phần đầu tiên (bỏ qua 'Chưa học' vì mục đích là click để ôn tập)
  const barSeriesData = series.slice(0, 6);
  const barLabels = labels.slice(0, 6);
  const barColors = colors.slice(0, 6);
  const reviewKeys = ['due_now', 'due_1', 'due_3', 'due_7', 'due_14', 'mastered'];

  const barOptions = {
    chart: {
      type: 'bar',
      foreColor: ink.muted,
      toolbar: { show: false },
      events: {
        // Bắt sự kiện click vào cột
        dataPointSelection: (event, chartContext, config) => {
          const dataIndex = config.dataPointIndex;
          if (dataIndex >= 0 && dataIndex < reviewKeys.length && onStartReview) {
            handleStartReview(reviewKeys[dataIndex]);
          }
        }
      }
    },
    colors: barColors,
    plotOptions: {
      bar: {
        distributed: true, // Quan trọng: Để mỗi cột có 1 màu tương ứng với mảng colors
        borderRadius: 4,
        horizontal: false,
        columnWidth: '60%',
        cursor: 'pointer',
        dataLabels: {
          position: 'top' // Places labels at the top of the columns
        }
      }
    },
    dataLabels: {
      offsetY: -20,
      enabled: true,
      style: {
        fontSize: '12px',
        fontFamily: 'Inter, sans-serif',
        // The numbers sit above the bars, on the panel background, so they
        // follow the theme's text colour rather than each bar's colour.
        colors: [ink.text],
      }
    },
    legend: { show: false }, // Ẩn legend vì đã dùng distributed
    xaxis: {
      categories: barLabels,
      labels: {
        style: {
          colors: barLabels.map(() => ink.muted),
          fontSize: '11px',
          fontFamily: 'Inter, sans-serif',
        }
      },
      axisBorder: { show: false },
      axisTicks: { show: false }
    },
    yaxis: {
      minWidth: 200,
      labels: {
        style: {
          colors: ink.muted
        },
        formatter: function (val) {
        return (val < 100?' ': '') + val;
      }
      }
    },
    grid: {
      borderColor: ink.grid,
      strokeDashArray: 4,
    },
    tooltip: {
      theme: ink.tooltip
    }
  };

  if (totalWords === 0) return <div className="h-[200px] flex items-center justify-center chart-hint">Đang tải biểu đồ...</div>;

  return (
    <div className="w-full flex flex-col">
      {/* One chart at a time. The bar view is the actionable one, so it leads. */}
      <div className="chart-toggle">
        <div
          className="segmented"
          role="group"
          aria-label="Kiểu biểu đồ"
          style={{ '--seg-count': 2, '--seg-index': view === 'bar' ? 0 : 1 }}
        >
          <span className="segmented-thumb" aria-hidden="true" />
          <button
            type="button"
            className={`segmented-btn icon-only ${view === 'bar' ? 'active' : ''}`}
            onClick={() => setView('bar')}
            title="Biểu đồ cột"
            aria-pressed={view === 'bar'}
          >
            <i className="fa-solid fa-chart-column"></i>
          </button>
          <button
            type="button"
            className={`segmented-btn icon-only ${view === 'donut' ? 'active' : ''}`}
            onClick={() => setView('donut')}
            title="Biểu đồ tròn"
            aria-pressed={view === 'donut'}
          >
            <i className="fa-solid fa-chart-pie"></i>
          </button>
        </div>
      </div>

      {view === 'donut' ? (
        <div className="w-full max-w-[220px] mx-auto">
          <Chart options={donutOptions} series={series} type="donut" width="100%" />
        </div>
      ) : (
        <div className="w-full cursor-pointer">
          <h4 className="text-sm chart-hint font-medium text-center">Nhấn vào cột để bắt đầu ôn tập</h4>
          <Chart
            options={barOptions}
            series={[{ name: 'Số lượng từ', data: barSeriesData }]}
            type="bar"
            height={260}
            width="100%"
          />
        </div>
      )}
    </div>
  );
}
