'use client';
import { useAuth } from '@/hooks/useAuth';
import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { Home, Users, FileText, Zap, LogOut, Menu, Building, Shield, ChevronLeft, ChevronRight, Sun, Moon, X } from 'lucide-react';
import { useState, useEffect } from 'react';

export default function DashboardLayout({ children }: { children: React.ReactNode }) {
  const { user, logout, loading } = useAuth();
  const pathname = usePathname();
  const router = useRouter();
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [isCollapsed, setIsCollapsed] = useState(false);
  const [darkMode, setDarkMode] = useState(false);

  // Load sidebar and dark mode preferences from localStorage on mount
  useEffect(() => {
    if (typeof window !== 'undefined') {
      const collapsedVal = localStorage.getItem('sidebar-collapsed');
      if (collapsedVal === 'true') {
        // eslint-disable-next-line react-hooks/set-state-in-effect
        setIsCollapsed(true);
      }
      const darkVal = localStorage.getItem('dark-mode');
      if (darkVal === 'true') {
        setDarkMode(true);
        document.documentElement.classList.add('dark');
      }
    }
  }, []);

  // Redirect Manager if they try to access /users
  useEffect(() => {
    if (user && user.user_type === 'M' && pathname.startsWith('/users')) {
      router.push('/dashboard');
    }
  }, [user, pathname, router]);

  // Auto-close sidebar on mobile when route changes
  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setSidebarOpen(false);
  }, [pathname]);

  if (loading) return <div className="min-h-screen flex items-center justify-center dark:bg-gray-900 dark:text-white">Loading...</div>;
  if (!user) return null;

  const toggleSidebarCollapse = () => {
    const newVal = !isCollapsed;
    setIsCollapsed(newVal);
    localStorage.setItem('sidebar-collapsed', String(newVal));
  };

  const toggleDarkMode = () => {
    const newVal = !darkMode;
    setDarkMode(newVal);
    localStorage.setItem('dark-mode', String(newVal));
    if (newVal) {
      document.documentElement.classList.add('dark');
    } else {
      document.documentElement.classList.remove('dark');
    }
  };

  const navigation = [
    { name: 'Dashboard', href: '/dashboard', icon: Home },
    { name: 'Rooms', href: '/rooms', icon: Building },
    { name: 'Tenants', href: '/tenants', icon: Users },
    { name: 'Invoices', href: '/invoices', icon: FileText },
    { name: 'Electricity', href: '/electricity', icon: Zap },
  ];

  // Show user/role management to SA and A only
  if (user.user_type === 'SA' || user.user_type === 'A') {
    navigation.push({ name: 'Users', href: '/users', icon: Shield });
  }

  navigation.push({ name: 'Profile', href: '/profile', icon: Users });

  const getPageTitle = (path: string) => {
    if (path.startsWith('/dashboard')) return 'Dashboard';
    if (path.startsWith('/rooms')) return 'Room Management';
    if (path.startsWith('/tenants')) return 'Tenant Management';
    if (path.startsWith('/invoices')) return 'Invoices';
    if (path.startsWith('/electricity')) return 'Electricity Readings';
    if (path.startsWith('/users')) return 'User Management';
    if (path.startsWith('/profile')) return 'My Profile';
    return 'Room Rent Manager';
  };

  return (
    <div className="h-screen overflow-hidden bg-gray-100 dark:bg-gray-900 flex text-gray-900 dark:text-gray-100 transition-colors duration-150">
      {/* Mobile Sidebar Backdrop */}
      {sidebarOpen && (
        <div 
          className="fixed inset-0 bg-black/50 z-40 lg:hidden"
          onClick={() => setSidebarOpen(false)}
        />
      )}

      {/* Sidebar */}
      <div 
        className={`fixed inset-y-0 left-0 z-50 bg-white dark:bg-gray-900 text-gray-900 dark:text-white transform transition-all duration-200 ease-in-out lg:relative lg:translate-x-0 border-r border-gray-200 dark:border-gray-800
          ${sidebarOpen ? 'translate-x-0' : '-translate-x-full'} 
          ${isCollapsed ? 'w-20' : 'w-64'} h-screen flex flex-col`}
      >
        <div className="h-16 flex items-center justify-between px-4 bg-gray-50 dark:bg-gray-950 font-bold text-lg border-b border-gray-200 dark:border-gray-800 flex-shrink-0">
          {!isCollapsed && <span className="truncate text-gray-900 dark:text-white">Room Rent Manager</span>}
          <div className="flex items-center gap-2">
            <button 
              onClick={toggleSidebarCollapse}
              className="hidden lg:flex p-1.5 rounded-lg hover:bg-gray-200 dark:hover:bg-gray-800 text-gray-500 dark:text-gray-400 hover:text-gray-900 dark:hover:text-white"
              title={isCollapsed ? "Expand Sidebar" : "Collapse Sidebar"}
            >
              {isCollapsed ? <ChevronRight className="h-5 w-5" /> : <ChevronLeft className="h-5 w-5" />}
            </button>
            <button 
              onClick={() => setSidebarOpen(false)}
              className="lg:hidden p-1.5 rounded-lg hover:bg-gray-200 dark:hover:bg-gray-800 text-gray-500 dark:text-gray-400 hover:text-gray-900 dark:hover:text-white cursor-pointer"
              title="Close Sidebar"
            >
              <X className="h-5 w-5" />
            </button>
          </div>
        </div>

        <nav className="flex-1 overflow-y-auto p-3 space-y-1">
          {navigation.map((item) => {
            const isActive = pathname.startsWith(item.href);
            return (
              <Link
                key={item.name}
                href={item.href}
                className={`flex items-center px-3 py-2.5 rounded-lg transition-colors ${isActive ? 'bg-blue-600 text-white' : 'text-gray-600 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-800'} ${isCollapsed ? 'justify-center' : ''}`}
                title={isCollapsed ? item.name : undefined}
              >
                <item.icon className={`h-5 w-5 ${isCollapsed ? '' : 'mr-3'}`} />
                {!isCollapsed && <span>{item.name}</span>}
              </Link>
            );
          })}
        </nav>

        <div className="p-3 border-t border-gray-200 dark:border-gray-800 bg-gray-50 dark:bg-gray-950 flex-shrink-0">
          {/* Theme Toggle inside Sidebar */}
          <button
            onClick={toggleDarkMode}
            className={`flex w-full items-center px-3 py-2 text-gray-600 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-800 rounded-lg transition-colors mb-2 cursor-pointer ${isCollapsed ? 'justify-center' : ''}`}
            title="Toggle Light/Dark Theme"
          >
            {darkMode ? <Sun className="h-5 w-5 text-yellow-500" /> : <Moon className="h-5 w-5 text-blue-500" />}
            {!isCollapsed && <span className="ml-3">Theme</span>}
          </button>

          {!isCollapsed && (
            <div className="flex flex-col mb-3 px-3 text-xs text-gray-500 dark:text-gray-400">
              <span className="truncate font-semibold text-gray-800 dark:text-gray-200">{user.name}</span>
              <span className="text-[10px] text-gray-400 dark:text-gray-500 font-medium">Role: {user.user_type === 'SA' ? 'Super Admin' : user.user_type === 'A' ? 'Owner Admin' : 'Manager'}</span>
            </div>
          )}

          <button
            onClick={logout}
            className={`flex w-full items-center px-3 py-2 text-gray-600 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-800 rounded-lg transition-colors cursor-pointer ${isCollapsed ? 'justify-center' : ''}`}
            title={isCollapsed ? "Sign Out" : undefined}
          >
            <LogOut className={`h-5 w-5 ${isCollapsed ? '' : 'mr-3'}`} />
            {!isCollapsed && <span>Sign Out</span>}
          </button>
        </div>
      </div>

      {/* Main content */}
      <div className="flex-1 flex flex-col min-w-0 overflow-hidden">
        <header className="sticky top-0 z-30 bg-white dark:bg-gray-800 shadow-sm border-b dark:border-gray-700">
          <div className="px-4 md:px-6 h-16 flex items-center justify-between">
            <div className="flex items-center gap-4">
              <button 
                onClick={() => setSidebarOpen(!sidebarOpen)} 
                className="lg:hidden p-2 text-gray-600 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-700 rounded-lg cursor-pointer"
                title="Open Sidebar"
              >
                <Menu className="h-6 w-6" />
              </button>
              <span className="font-bold text-lg text-gray-900 dark:text-white hidden lg:inline">
                {getPageTitle(pathname)}
              </span>
              <span className="font-bold text-lg text-gray-900 dark:text-white lg:hidden">
                Room Rent Manager
              </span>
            </div>
            
            <div className="flex items-center gap-4">
              {/* Theme Toggle (Desktop and Mobile) */}
              <button
                onClick={toggleDarkMode}
                className="p-2 text-gray-600 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-700 rounded-lg cursor-pointer"
                title="Toggle Light/Dark Theme"
              >
                {darkMode ? <Sun className="h-5 w-5 text-yellow-400" /> : <Moon className="h-5 w-5 text-blue-400" />}
              </button>

              <div className="h-6 w-px bg-gray-200 dark:bg-gray-700" />

              {/* User profile info (Desktop only) */}
              <div className="hidden md:flex flex-col text-right text-xs">
                <span className="font-semibold text-gray-900 dark:text-white">{user.name}</span>
                <span className="text-[10px] text-gray-500 dark:text-gray-400 font-medium">Role: {user.user_type === 'SA' ? 'Super Admin' : user.user_type === 'A' ? 'Owner Admin' : 'Manager'}</span>
              </div>
            </div>
          </div>
        </header>
        <main className="flex-1 overflow-y-auto p-4 md:p-6 lg:p-8">
          {children}
        </main>
      </div>
    </div>
  );
}
