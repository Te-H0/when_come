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
      className="fixed bottom-0 left-0 right-0 bg-white/90 backdrop-blur-xl border-t border-border-subtle z-50"
      style={{
        height: 'var(--bottom-nav-height)',
        paddingBottom: 'env(safe-area-inset-bottom)',
      }}
    >
      <div className="max-w-2xl mx-auto px-4 py-2">
        <div className="flex items-center justify-around">
          {navItems.map((item) => {
            const isActive = location.pathname === item.path;
            const Icon = item.icon;

            return (
              <button
                key={item.path}
                onClick={() => navigate(item.path)}
                className={`flex flex-col items-center gap-1 px-6 py-2 rounded-control transition-colors ${
                  isActive
                    ? "text-text-primary"
                    : "text-text-tertiary hover:text-text-secondary"
                }`}
              >
                <Icon className="w-6 h-6" strokeWidth={isActive ? 2.5 : 2} />
                <span className={`text-caption ${isActive ? 'font-semibold' : 'font-medium'}`}>
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
