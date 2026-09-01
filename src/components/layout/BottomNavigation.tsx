import React from 'react';
import { motion } from 'motion/react';
import { Home, CalendarDays, Swords, MessageCircleHeart, User } from 'lucide-react';

export type TabType = 'home' | 'routine' | 'challenges' | 'chat' | 'profile';

interface BottomNavigationProps {
  activeTab: TabType;
  onTabChange: (tab: TabType) => void;
  unreadChatCount?: number;
  pendingTasksCount?: number;
}

export const BottomNavigation: React.FC<BottomNavigationProps> = ({
  activeTab,
  onTabChange,
  unreadChatCount = 0,
  pendingTasksCount = 0,
}) => {
  const tabs: { id: TabType; label: string; icon: React.ReactNode; badge?: number }[] = [
    {
      id: 'home',
      label: 'Início',
      icon: <Home className="w-5 h-5" />,
    },
    {
      id: 'routine',
      label: 'Rotina',
      icon: <CalendarDays className="w-5 h-5" />,
      badge: pendingTasksCount > 0 ? pendingTasksCount : undefined,
    },
    {
      id: 'challenges',
      label: 'Arena',
      icon: <Swords className="w-5 h-5" />,
    },
    {
      id: 'chat',
      label: 'Chat',
      icon: <MessageCircleHeart className="w-5 h-5" />,
      badge: unreadChatCount > 0 ? unreadChatCount : undefined,
    },
    {
      id: 'profile',
      label: 'Perfil',
      icon: <User className="w-5 h-5" />,
    },
  ];

  return (
    <nav
      id="bottom-navigation-bar"
      className="fixed bottom-0 left-0 right-0 max-w-md mx-auto z-40 px-3 pb-4 pt-2"
    >
      <div className="bg-white/95 backdrop-blur-lg rounded-3xl shadow-[0_8px_30px_rgb(0,0,0,0.12)] border border-rose-100/80 px-2 py-1.5 flex items-center justify-around">
        {tabs.map(tab => {
          const isActive = activeTab === tab.id;
          return (
            <button
              key={tab.id}
              id={`nav-tab-${tab.id}`}
              onClick={() => onTabChange(tab.id)}
              className={`relative flex flex-col items-center justify-center py-1.5 px-3 rounded-2xl transition-all duration-200 ${
                isActive
                  ? 'text-rose-600 font-bold'
                  : 'text-slate-400 hover:text-slate-600 font-medium'
              }`}
            >
              {/* Active pill indicator background */}
              {isActive && (
                <motion.div
                  layoutId="activeTabPill"
                  className="absolute inset-0 bg-rose-50 rounded-2xl -z-10 border border-rose-100"
                  transition={{ type: 'spring', stiffness: 400, damping: 30 }}
                />
              )}

              {/* Icon Container with Badge */}
              <div className="relative">
                <motion.div
                  animate={{ scale: isActive ? 1.15 : 1 }}
                  transition={{ type: 'spring', stiffness: 400, damping: 25 }}
                >
                  {tab.icon}
                </motion.div>

                {tab.badge !== undefined && (
                  <span className="absolute -top-1.5 -right-2 min-w-[16px] h-4 px-1 bg-rose-500 text-white text-[10px] font-extrabold rounded-full flex items-center justify-center shadow-xs animate-pulse">
                    {tab.badge}
                  </span>
                )}
              </div>

              {/* Text Label */}
              <span className={`text-[11px] mt-1 whitespace-nowrap ${isActive ? 'text-rose-600' : 'text-slate-500'}`}>
                {tab.label}
              </span>
            </button>
          );
        })}
      </div>
    </nav>
  );
};
