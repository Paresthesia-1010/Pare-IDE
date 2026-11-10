import React from 'react';
import ReactDOM from 'react-dom/client';
import App from './App';
import ChatWindow from './components/ChatWindow';
import './index.css';

const isChatWindow = window.location.hash === '#chat';

ReactDOM.createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    {isChatWindow ? <ChatWindow /> : <App />}
  </React.StrictMode>
);