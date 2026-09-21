import { useContext } from 'react';
import { Link } from 'react-router-dom';
import { StreakContext } from '../context/StreakContext';

// Flame + day count in the navbar. Dimmed until today counts, so a glance says
// whether there is still something to do before midnight.
export default function StreakBadge() {
  const { streak } = useContext(StreakContext);
  if (!streak) return null;

  const { current, kept_today: keptToday, shields } = streak.streak;
  const { hard, goal } = streak.today;

  const title = [
    keptToday
      ? `Chuỗi ${current} ngày · hôm nay đã giữ chuỗi`
      : current > 0
        ? `Chuỗi ${current} ngày · làm 1 câu Khó hoặc 1 lượt Ôn tập hôm nay để giữ chuỗi`
        : 'Làm 1 câu SAT Khó hoặc 1 lượt Ôn tập hôm nay để bắt đầu chuỗi',
    `Hôm nay: ${hard}/${goal} câu Khó`,
    shields > 0 ? `${shields} khiên bảo vệ chuỗi` : null
  ].filter(Boolean).join('\n');

  return (
    <Link
      to="/questions"
      className={`streak-badge ${keptToday ? 'is-kept' : 'is-pending'}`}
      title={title}
      aria-label={title}
    >
      <i className="fa-solid fa-fire" aria-hidden="true" />
      <span className="streak-count">{current}</span>
      {shields > 0 && (
        <span className="streak-shields" aria-hidden="true">
          {Array.from({ length: shields }, (_, i) => <i key={i} className="fa-solid fa-shield-halved" />)}
        </span>
      )}
    </Link>
  );
}
