import { Routes, Route } from 'react-router-dom';
import { AuthProvider } from './context/AuthContext.jsx';
import { ThemeProvider } from './context/ThemeContext.jsx';
import { ChatProvider } from './context/ChatContext.jsx';
import { StreakProvider } from './context/StreakContext.jsx';
import Navbar from './components/Navbar.jsx';
import ChatPanel from './components/ChatPanel.jsx';
import HomePage from './pages/HomePage.jsx';
import NotebooksPage from './pages/NotebooksPage.jsx';
import QuizPage from './pages/QuizPage.jsx';
import QuestionsPage from './pages/QuestionsPage.jsx';
import DailySessionPage from './pages/DailySessionPage.jsx';
import StudyPage from './pages/StudyPage.jsx';
import AboutPage from './pages/AboutPage.jsx';
import DonatePage from './pages/DonatePage.jsx';
import PrivacyPage from './pages/PrivacyPage.jsx';

function App() {
  return (
    <ThemeProvider>
      <AuthProvider>
        <StreakProvider>
          <ChatProvider>
            <div className="app-container">
              <Navbar />
              <main className="main-content">
                <Routes>
                  <Route path="/" element={<HomePage />} />
                  <Route path="/notebooks" element={<NotebooksPage />} />
                  <Route path="/study/:notebookId" element={<StudyPage />} />
                  <Route path="/quiz/:bucket" element={<QuizPage />} />
                  <Route path="/questions" element={<QuestionsPage />} />
                  <Route path="/questions/daily" element={<DailySessionPage />} />
                  <Route path="/about" element={<AboutPage />} />
                  <Route path="/donate" element={<DonatePage />} />
                  <Route path="/privacy" element={<PrivacyPage />} />
                </Routes>
              </main>
              {/* Outside <Routes>, so a conversation survives moving between pages. */}
              <ChatPanel />
            </div>
          </ChatProvider>
        </StreakProvider>
      </AuthProvider>
    </ThemeProvider>
  );
}

export default App;
