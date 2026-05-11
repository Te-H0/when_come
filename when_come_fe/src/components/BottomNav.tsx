import { Home, Star, List } from "lucide-react";
import { useNavigate, useLocation } from "react-router";

export default function BottomNav() {
  const navigate = useNavigate();
  const location = useLocation();

  const navItems = [
    { icon: Home, label: "홈", path: "/" },
    { icon: Star, label: "즐겨찾기", path: "/favorites" },
    { icon: List, label: "내 경로", path: "/routes" },
  ];

  return (
    <div
      className="fixed left-0 right-0 border-t border-border-subtle z-50"
      style={{
        bottom: 'var(--keyboard-inset-height, 0px)',
        height: 'var(--bottom-nav-total)',
        paddingBottom: 'env(safe-area-inset-bottom)',
        // backdrop-blur 미지원 환경 fallback — 본문 글씨 비침 방지
        backgroundColor: 'rgba(255, 255, 255, 0.96)',
        backdropFilter: 'blur(20px)',
        WebkitBackdropFilter: 'blur(20px)',
      }}
    >
      <div className="max-w-2xl mx-auto px-4 py-1">
        <div className="flex items-center justify-around">
          {navItems.map((item) => {
            const isActive = location.pathname === item.path;
            const Icon = item.icon;

            return (
              <button
                key={item.path}
                onClick={() => navigate(item.path)}
                className={`flex flex-col items-center gap-0.5 px-6 py-1 rounded-control transition-colors ${
                  isActive
                    ? "text-text-primary"
                    : "text-text-secondary hover:text-text-primary"
                }`}
              >
                <Icon className="w-[22px] h-[22px]" strokeWidth={isActive ? 2.5 : 2} />
                <span className={`text-caption ${isActive ? 'font-semibold text-text-primary' : 'font-normal'}`}>
                  {item.label}
                </span>
              </button>
            );
          })}
        </div>
      </div>
    </div>
  );
}
