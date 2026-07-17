import React, { useEffect } from 'react';
import { CheckCircle, AlertCircle, X } from 'lucide-react';

export type NotificationType = 'success' | 'error' | 'warning';

interface NotificationProps {
  show: boolean;
  message: string;
  type?: NotificationType;
  onClose: () => void;
  duration?: number;
}

export const Notification: React.FC<NotificationProps> = ({ 
  show, 
  message, 
  type = 'success', 
  onClose, 
  duration = 2000 
}) => {
  const onCloseRef = React.useRef(onClose);
  useEffect(() => {
    onCloseRef.current = onClose;
  }, [onClose]);

  useEffect(() => {
    if (show && duration > 0) {
      const timer = setTimeout(() => {
        onCloseRef.current();
      }, duration);
      return () => clearTimeout(timer);
    }
  }, [show, duration]);

  if (!show) return null;

  const bgColors = {
    success: 'bg-green-600 dark:bg-green-500',
    error: 'bg-red-600 dark:bg-red-500',
    warning: 'bg-orange-500 dark:bg-orange-400'
  };

  const Icons = {
    success: <CheckCircle className="text-white" size={24} />,
    error: <AlertCircle className="text-white" size={24} />,
    warning: <AlertCircle className="text-white" size={24} />
  };

  return (
    <div className="fixed top-6 right-6 z-[9999] animate-slide-in">
      <div className={`${bgColors[type]} text-white px-6 py-4 rounded-2xl shadow-2xl flex items-center gap-4 min-w-[300px] border border-white/10 backdrop-blur-md`}>
        <div className="bg-white/20 p-2 rounded-xl">
          {Icons[type]}
        </div>
        <div className="flex-1">
          <p className="font-black text-sm uppercase tracking-wider">Notificação</p>
          <p className="font-medium text-lg leading-tight">{message}</p>
        </div>
        <button 
          onClick={onClose}
          className="p-1 hover:bg-white/20 rounded-lg transition-colors"
        >
          <X size={20} />
        </button>
      </div>
      
      {/* Progress Bar */}
      <div className="absolute bottom-0 left-0 h-1 bg-white/30 rounded-full animate-progress-shrink" style={{ animationDuration: `${duration}ms` }}></div>
      
      <style>{`
        @keyframes slide-in {
          0% { transform: translateX(100%); opacity: 0; }
          100% { transform: translateX(0); opacity: 1; }
        }
        @keyframes progress-shrink {
          0% { width: 100%; }
          100% { width: 0%; }
        }
        .animate-slide-in {
          animation: slide-in 0.3s cubic-bezier(0.16, 1, 0.3, 1) forwards;
        }
        .animate-progress-shrink {
          animation: progress-shrink linear forwards;
        }
      `}</style>
    </div>
  );
};
