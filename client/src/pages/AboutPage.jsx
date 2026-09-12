import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { fetchVocabCount, fetchNotebooks, fetchQuestions } from '../api';

// The same ladder the server walks (getIntervalDaysForLevel in server/index.js,
// client/src/lib/srs.js), with the names the question page already uses.
const LADDER = [
  { level: 'Học lại', wait: 'Ôn ngay', when: 'Mới học hoặc vừa quên' },
  { level: 'Cấp 1', wait: '1 ngày', when: 'Vừa nhớ được lần đầu' },
  { level: 'Cấp 2', wait: '3 ngày', when: 'Nhớ lại đúng lần thứ hai' },
  { level: 'Cấp 3', wait: '7 ngày', when: 'Bắt đầu vào trí nhớ dài hạn' },
  { level: 'Cấp 4', wait: '14 ngày', when: 'Đã khá chắc' },
  { level: 'Nhớ sâu', wait: '30 ngày', when: 'Chỉ cần nhắc lại thỉnh thoảng' }
];

const formatCount = (n) => (Number.isFinite(n) ? n.toLocaleString('vi-VN') : '—');

export default function AboutPage() {
  // Live counts rather than numbers typed into the page, which would go stale
  // the next time a notebook or question set is imported.
  const [stats, setStats] = useState({ words: null, notebooks: null, questions: null });

  useEffect(() => {
    let alive = true;
    Promise.allSettled([fetchVocabCount(), fetchNotebooks(), fetchQuestions({ limit: 1 })])
      .then(([words, notebooks, questions]) => {
        if (!alive) return;
        setStats({
          words: words.status === 'fulfilled' ? Number(words.value.total) : null,
          // Built-in notebooks only: a signed-in user's own lists are not content we ship.
          notebooks: notebooks.status === 'fulfilled'
            ? (notebooks.value.notebooks || []).filter((nb) => nb.owner_user_id == null).length
            : null,
          questions: questions.status === 'fulfilled' ? Number(questions.value.total) : null
        });
      });
    return () => { alive = false; };
  }, []);

  return (
    <div className="info-page">
      <section className="info-hero">
        <h1 className="hero-title">Về NeuroLex</h1>
        <p className="hero-subtitle">
          Một nơi học từ vựng IELTS và SAT theo cách bộ não thực sự ghi nhớ: ôn đúng lúc sắp quên,
          rồi gặp lại từ đó trong câu văn thật.
        </p>
      </section>

      <section className="card info-section">
        <div className="info-stats">
          <div className="info-stat"><strong>{formatCount(stats.words)}</strong><span>từ vựng</span></div>
          <div className="info-stat"><strong>{formatCount(stats.notebooks)}</strong><span>sổ tay theo chủ đề và kỳ thi</span></div>
          <div className="info-stat"><strong>{formatCount(stats.questions)}</strong><span>câu hỏi từ trong ngữ cảnh</span></div>
        </div>
      </section>

      <section className="card info-section">
        <h2><i className="fa-solid fa-route"></i> Học như thế nào</h2>
        <ol className="info-steps">
          <li>
            <span>
              <strong>Học sổ tay.</strong> Mở một sổ tay, xem từ, tự nhớ nghĩa rồi bấm
              “Đã thuộc” hoặc “Chưa thuộc”. Lần sau mở lại, bạn học tiếp đúng chỗ đang dừng.
            </span>
          </li>
          <li>
            <span>
              <strong>Ôn đúng hạn.</strong> Mỗi từ có lịch ôn riêng. Khi đến hạn, bạn làm trắc nghiệm
              hai chiều: từ sang nghĩa và nghĩa sang từ.
            </span>
          </li>
          <li>
            <span>
              <strong>Gặp lại trong câu thật.</strong> Trang Câu hỏi lọc ra những câu chứa chính các từ
              bạn đã học, để bạn nhận ra chúng khi đọc chứ không chỉ khi nhìn thẻ từ.
            </span>
          </li>
        </ol>
      </section>

      <section className="card info-section">
        <h2><i className="fa-solid fa-brain"></i> Lặp lại ngắt quãng</h2>
        <p>
          Dựa trên đường cong lãng quên của Hermann Ebbinghaus: mỗi lần nhớ lại đúng, khoảng cách đến
          lần ôn tiếp theo dài ra. Nhờ vậy bạn dành thời gian cho từ sắp quên thay vì từ đã thuộc.
        </p>
        <div className="srs-ladder">
          <table>
            <thead>
              <tr><th>Mức</th><th>Ôn lại sau</th><th>Nghĩa là</th></tr>
            </thead>
            <tbody>
              {LADDER.map((row) => (
                <tr key={row.level}><td>{row.level}</td><td>{row.wait}</td><td>{row.when}</td></tr>
              ))}
            </tbody>
          </table>
        </div>
        <p className="info-footnote">
          Trong bài ôn, đúng cả hai câu thì lên một mức, đúng một câu thì giữ nguyên, sai cả hai thì về
          “Học lại”. Ở trang Câu hỏi, trả lời sai chỉ lùi một mức, vì đoán nghĩa trong câu dài khó hơn
          nhìn thẻ từ.
        </p>
      </section>

      <section className="card info-section">
        <h2><i className="fa-solid fa-book-open"></i> Nội dung</h2>
        <p>
          Từ vựng được tổng hợp từ các nguồn luyện thi quen thuộc như Cambridge IELTS Advanced, Magoosh
          và VietAccepted, chia thành sổ tay theo kỳ thi, trình độ và chủ đề. Mỗi từ có phiên âm,
          nghĩa tiếng Anh và tiếng Việt, ví dụ và từ đồng nghĩa.
        </p>
      </section>

      <section className="card info-section">
        <h2><i className="fa-regular fa-user"></i> Không cần tài khoản</h2>
        <p>
          Bạn có thể học ngay, tiến độ được lưu trên trình duyệt đang dùng. Đăng nhập khi muốn giữ tiến
          độ lâu dài và học tiếp trên máy khác; những gì đã học trước đó sẽ được gộp vào tài khoản.
        </p>
      </section>

      <section className="card info-section">
        <h2><i className="fa-brands fa-github"></i> Mã nguồn mở</h2>
        <p>
          NeuroLex miễn phí và không có quảng cáo. Mã nguồn được công khai trên{' '}
          <a className="info-link" href="https://github.com/CodingchallengeJS/NeuroLex" target="_blank" rel="noreferrer">
            GitHub
          </a>.
        </p>
      </section>

      <div className="info-actions">
        <Link to="/notebooks" className="btn-primary"><i className="fa-solid fa-play"></i> Bắt đầu học</Link>
        <Link to="/donate" className="btn-outline"><i className="fa-solid fa-heart"></i> Ủng hộ NeuroLex</Link>
      </div>
    </div>
  );
}
