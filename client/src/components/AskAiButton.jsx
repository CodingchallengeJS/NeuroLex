import { useChat } from '../context/ChatContext';

// "Hỏi AI": opens the chat with what is on screen attached to the next message.
// getContext is a function so a list of hundreds of vocab cards does not build
// every card's context up front.
export default function AskAiButton({ getContext, label = 'Hỏi AI', variant = 'button', title = 'Hỏi trợ lý AI về nội dung này' }) {
  const { askAbout } = useChat();

  const onClick = (event) => {
    event.stopPropagation();
    askAbout(getContext());
  };

  if (variant === 'icon') {
    return (
      <button type="button" className="icon-btn audio-btn" onClick={onClick} title={title} aria-label={title}>
        <i className="fa-solid fa-wand-magic-sparkles"></i>
      </button>
    );
  }

  return (
    <button type="button" className="ask-ai-btn" onClick={onClick} title={title}>
      <i className="fa-solid fa-wand-magic-sparkles"></i> {label}
    </button>
  );
}
