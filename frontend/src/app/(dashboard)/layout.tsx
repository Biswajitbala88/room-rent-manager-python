'use client';
import { useAuth } from '@/hooks/useAuth';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { Home, Users, FileText, Zap, LogOut, Menu } from 'lucide-react';
import { useState } from 'react';

export default function DashboardLayout({ children }: { children: React.ReactNode }) {
  const { user, logout, loading } = useAuth();
  const pathname = usePathname();
  const [sidebarOpen, setSidebarOpen] = useState(false);

  if (loading) return <div className="min-h-screen flex items-center justify-center">Loading...</div>;
  if (!user) return null;

  const navigation = [
    { name: 'Dashboard', href: '/dashboard', icon: Home },
    { name: 'Tenants', href: '/tenants', icon: Users },
    { name: 'Invoices', href: '/invoices', icon: FileText },
    { name: 'Electricity', href: '/electricity', icon: Zap },
    { name: 'Profile', href: '/profile', icon: Users },
  ];

  return (
    <div className="min-h-screen bg-gray-100 flex">
      {/* Sidebar */}
      <div className={`fixed inset-y-0 left-0 z-50 w-64 bg-gray-900 text-white transform transition-transform duration-200 ease-in-out lg:relative lg:translate-x-0 ${sidebarOpen ? 'translate-x-0' : '-translate-x-full'}`}>
        <div className="h-16 flex items-center px-6 bg-gray-950 font-bold text-xl">
          Room Rent Manager
        </div>
        <nav className="p-4 space-y-1">
          {navigation.map((item) => {
            const isActive = pathname.startsWith(item.href);
            return (
              <Link
                key={item.name}
                href={item.href}
                className={`flex items-center px-4 py-3 rounded-lg transition-colors ${isActive ? 'bg-blue-600 text-white' : 'text-gray-300 hover:bg-gray-800'}`}
              >
                <item.icon className="h-5 w-5 mr-3" />
                {item.name}
              </Link>
            );
          })}
        </nav>
        <div className="absolute bottom-0 w-full p-4 border-t border-gray-800">
          <div className="flex items-center mb-4 px-4 text-sm text-gray-400">
            <span className="truncate">{user.name} ({user.user_type})</span>
          </div>
          <button
            onClick={logout}
            className="flex w-full items-center px-4 py-2 text-gray-300 hover:bg-gray-800 rounded-lg transition-colors"
          >
            <LogOut className="h-5 w-5 mr-3" />
            Sign Out
          </button>
        </div>
      </div>

      {/* Main content */}
      <div className="flex-1 flex flex-col min-w-0 overflow-hidden">
        <header className="bg-white shadow-sm lg:hidden">
          <div className="px-4 h-16 flex items-center justify-between">
            <span className="font-bold text-xl">Room Rent Manager</span>
            <button onClick={() => setSidebarOpen(!sidebarOpen)} className="p-2 -mr-2">
              <Menu className="h-6 w-6" />
            </button>
          </div>
        </header>
        <main className="flex-1 overflow-y-auto p-4 md:p-6 lg:p-8">
          {children}
        </main>
      </div>
    </div>
  );
}
