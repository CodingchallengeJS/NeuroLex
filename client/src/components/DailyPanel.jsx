import { useContext } from 'react';
import { Link } from 'react-router-dom';
import { AuthContext } from '../context/AuthContext';
import { StreakContext } from '../context/StreakContext';

const WEEKDAYS = ['T2', 'T3', 'T4', 'T5', 'T6', 'T7', 'CN'];

const STATUS_TEXT = {
  none: 'chưa học',
  kept: 'giữ chuỗi',
  goal: 'đạt mục tiêu 5 câu',
  bonus: 'vượt mức 10 câu (+1 khiên)',
  shielded: 'nghỉ, khiên đã giữ chuỗi'
};

function formatDay(iso) {
  const [y, m, d] = iso.split('-');
  return `${d}/${m}/${y}`;
}

function Heatmap({ days, today }) {
  return (
    <div className="heatmap" role="img" aria-label="Lịch học 5 tuần gần nhất">
      <div className="heatmap-weekdays" aria-hidden="true">
        {WEEKDAYS.map(w => <span key={w}>{w}</span>)}
      </div>
      <div className="heatmap-grid">
        {days.map(d => (
          <span
            key={d.date}
            className={`heatmap-cell is-${d.status} ${d.date === today ? 'is-today' : ''}`}
            title={[
              formatDay(d.date),
              d.date === today && d.status === 'none' ? 'hôm nay, chưa học' : STATUS_TEXT[d.status],
              `${d.hard} câu Khó${d.hard > 0 ? ` (đúng ${d.correct})` : ''}`,
              d.quiz > 0 ? `${d.quiz} lượt Ôn tập hôm nay` : null
            ].filter(Boolean).join(' · ')}
          >
            {d.status === 'shielded' && <i className="fa-solid fa-shield-halved" aria-hidden="true" />}
          </span>
        ))}
      </div>
      <div className="heatmap-legend" aria-hidden="true">
        <span><i className="heatmap-cell is-none" /> chưa</span>
        <span><i className="heatmap-cell is-kept" /> 1+</span>
        <span><i className="heatmap-cell is-goal" /> 5+</span>
        <span><i className="heatmap-cell is-bonus" /> 10+</span>
      </div>
    </div>
  );
}

export default function DailyPanel() {
  const { user, openAuth } = useContext(AuthContext);
  const { streak } = useContext(StreakContext);

  if (!user) {
    return (
      <div className="card daily-panel daily-panel-guest">
        <i className="fa-solid fa-fire" aria-hidden="true" />
        <span>Đăng nhập để giữ chuỗi ngày học và theo dõi mục tiêu 5 câu SAT Khó mỗi ngày.</span>
        <button className="btn-primary btn-sm" onClick={openAuth}>Đăng nhập</button>
      </div>
    );
  }
  if (!streak) return null;

  const { today, streak: s, days, bank } = streak;
  const goalMet = today.hard >= today.goal;
  const bonusMet = today.hard >= today.bonus;
  const fill = Math.min(today.hard / today.bonus, 1) * 100;
  const goalMark = (today.goal / today.bonus) * 100;

  const remaining = Math.max(bank.total - bank.answered, 0);
  const daysLeft = Math.ceil(remaining / today.goal);

  let hint;
  if (!s.kept_today) {
    hint = s.current > 0
      ? `Làm 1 câu Khó hoặc 1 lượt Ôn tập để giữ chuỗi ${s.current} ngày.`
      : 'Làm 1 câu Khó hoặc 1 lượt Ôn tập để bắt đầu chuỗi.';
  } else if (!goalMet) {
    hint = `Đã giữ chuỗi. Còn ${today.goal - today.hard} câu nữa là đạt mục tiêu hôm nay.`;
  } else if (!bonusMet) {
    hint = s.shields >= s.max_shields
      ? `Đạt mục tiêu! Khiên đã đầy (${s.max_shields}), làm thêm là để luyện tay.`
      : `Đạt mục tiêu! Thêm ${today.bonus - today.hard} câu nữa để nhận 1 khiên bảo vệ chuỗi.`;
  } else {
    hint = 'Vượt mức 10 câu hôm nay. Tuyệt vời!';
  }

  return (
    <div className="card daily-panel">
      <div className="daily-main">
        <div className="daily-streak">
          <div className={`daily-flame ${s.kept_today ? 'is-kept' : ''}`}>
            <i className="fa-solid fa-fire" aria-hidden="true" />
            <span className="daily-streak-num">{s.current}</span>
          </div>
          <div className="daily-streak-text">
            <strong>ngày liên tiếp</strong>
            <span>Kỷ lục {s.best} ngày</span>
            <span className="daily-shields" title="10 câu Khó trong một ngày = +1 khiên. Khiên tự giữ chuỗi khi bạn lỡ một ngày.">
              {Array.from({ length: s.max_shields }, (_, i) => (
                <i key={i} className={`fa-solid fa-shield-halved ${i < s.shields ? 'is-on' : ''}`} aria-hidden="true" />
              ))}
              <span>{s.shields}/{s.max_shields} khiên</span>
            </span>
          </div>
        </div>

        <div className="daily-goal">
          <div className="daily-goal-head">
            <span><strong>{today.hard}</strong>/{today.goal} câu Khó hôm nay{today.hard > 0 ? ` · đúng ${today.correct}` : ''}</span>
            {today.quiz > 0 && <span className="chip"><i className="fa-solid fa-check" /> Ôn tập</span>}
          </div>
          <div
            className={`daily-bar ${goalMet ? 'is-goal' : ''} ${bonusMet ? 'is-bonus' : ''}`}
            role="progressbar"
            aria-valuemin={0}
            aria-valuemax={today.bonus}
            aria-valuenow={Math.min(today.hard, today.bonus)}
            aria-label="Tiến độ câu Khó hôm nay"
          >
            <div className="daily-bar-fill" style={{ width: `${fill}%` }} />
            <span className="daily-bar-mark" style={{ left: `${goalMark}%` }} title="Mục tiêu 5 câu" />
          </div>
          <div className="daily-bar-scale" aria-hidden="true">
            <span>0</span>
            <span style={{ left: `${goalMark}%` }}>5 · mục tiêu</span>
            <span>10 · +1 khiên</span>
          </div>
          <p className="daily-hint">{hint}</p>
          <div className="daily-actions">
            <Link to="/questions/daily" className="btn-primary">
              <i className="fa-solid fa-bolt" /> {goalMet ? 'Làm thêm 5 câu' : 'Làm 5 câu hôm nay'}
            </Link>
            <span className="daily-bank" title="Tính theo lần trả lời gần nhất của mỗi câu">
              Đúng {bank.correct}/{bank.total} câu SAT Khó
              {remaining > 0 ? ` · còn ${remaining} câu chưa làm (~${daysLeft} ngày với nhịp ${today.goal} câu/ngày)` : ' · đã làm hết bộ đề'}
            </span>
          </div>
        </div>

        <Heatmap days={days} today={today.date} />
      </div>
    </div>
  );
}
