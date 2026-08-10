'use client';
import { useState } from 'react';
import { useAuth } from '@/hooks/useAuth';
import { api } from '@/lib/api';
import toast from 'react-hot-toast';
import Link from 'next/link';
import { LogIn, Key, ChevronDown, ChevronUp } from 'lucide-react';

export default function LoginPage() {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const { login } = useAuth();
  const [isLoading, setIsLoading] = useState(false);
  const [isAccordionOpen, setIsAccordionOpen] = useState(false);

  const demoAccounts = [
    {
      role: 'Super Admin',
      email: 'superadmin@user.com',
      password: '12345678',
      color: 'bg-indigo-50/50 border-indigo-100 text-indigo-900 hover:bg-indigo-50 hover:border-indigo-200',
      badgeColor: 'bg-indigo-100 text-indigo-800'
    },
    {
      role: 'Admin',
      email: 'admin@user.com',
      password: '12345678',
      color: 'bg-emerald-50/50 border-emerald-100 text-emerald-900 hover:bg-emerald-50 hover:border-emerald-200',
      badgeColor: 'bg-emerald-100 text-emerald-800'
    },
    {
      role: 'Manager',
      email: 'manager@user.com',
      password: '12345678',
      color: 'bg-amber-50/50 border-amber-100 text-amber-900 hover:bg-amber-50 hover:border-amber-200',
      badgeColor: 'bg-amber-100 text-amber-800'
    }
  ];

  const handleFill = (emailVal: string, passwordVal: string) => {
    setEmail(emailVal);
    setPassword(passwordVal);
    toast.success('Credentials filled!');
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsLoading(true);
    try {
      const formData = new URLSearchParams();
      formData.append('username', email);
      formData.append('password', password);
      
      const { data } = await api.post('/auth/login', formData, {
        headers: {
          'Content-Type': 'application/x-www-form-urlencoded'
        }
      });
      
      await login(`Bearer ${data.access_token}`);
      toast.success('Successfully logged in!');
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    } catch (error: any) {
      toast.error(error.response?.data?.detail || 'Failed to login');
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-gray-50 py-12 px-4 sm:px-6 lg:px-8">
      <div className="max-w-md w-full space-y-8 bg-white p-8 rounded-xl shadow-lg border border-gray-100">
        <div>
          <div className="mx-auto h-12 w-12 bg-blue-100 rounded-full flex items-center justify-center">
            <LogIn className="h-6 w-6 text-blue-600" />
          </div>
          <h2 className="mt-6 text-center text-3xl font-extrabold text-gray-900">
            Sign in to your account
          </h2>
        </div>
        <form className="mt-8 space-y-6" onSubmit={handleSubmit}>
          <div className="rounded-md shadow-sm space-y-4">
            <div>
              <label className="block text-sm font-medium text-gray-700">Email address</label>
              <input
                type="email"
                required
                className="appearance-none rounded-lg relative block w-full px-3 py-2 border border-gray-300 placeholder-gray-500 text-gray-900 focus:outline-none focus:ring-blue-500 focus:border-blue-500 focus:z-10 sm:text-sm"
                placeholder="Email address"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700">Password</label>
              <input
                type="password"
                required
                className="appearance-none rounded-lg relative block w-full px-3 py-2 border border-gray-300 placeholder-gray-500 text-gray-900 focus:outline-none focus:ring-blue-500 focus:border-blue-500 focus:z-10 sm:text-sm"
                placeholder="Password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
              />
            </div>
          </div>

          <div>
            <button
              type="submit"
              disabled={isLoading}
              className="group relative w-full flex justify-center py-2 px-4 border border-transparent text-sm font-medium rounded-lg text-white bg-blue-600 hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500 disabled:bg-blue-400 transition-colors"
            >
              {isLoading ? 'Signing in...' : 'Sign in'}
            </button>
          </div>
          
          <div className="text-sm text-center">
            <Link href="/register" className="font-medium text-blue-600 hover:text-blue-500">
              {"Don't have an account? Register"}
            </Link>
          </div>
        </form>

        {/* Accordion for Demo Accounts */}
        <div className="mt-6 border-t border-gray-100 pt-6">
          <button
            type="button"
            onClick={() => setIsAccordionOpen(!isAccordionOpen)}
            className="w-full flex items-center justify-between py-2 text-sm font-medium text-gray-500 hover:text-gray-700 focus:outline-none transition-colors cursor-pointer"
          >
            <span className="flex items-center gap-2">
              <Key className="h-4 w-4 text-blue-500" />
              Demo Credentials (Click to Autofill)
            </span>
            {isAccordionOpen ? (
              <ChevronUp className="h-4 w-4 text-gray-400" />
            ) : (
              <ChevronDown className="h-4 w-4 text-gray-400" />
            )}
          </button>
          
          {isAccordionOpen && (
            <div className="mt-3 space-y-2 transition-all duration-300">
              {demoAccounts.map((account) => (
                <button
                  key={account.role}
                  type="button"
                  onClick={() => handleFill(account.email, account.password)}
                  className={`w-full text-left p-3 rounded-lg border text-xs flex flex-col gap-1 transition-all cursor-pointer ${account.color}`}
                >
                  <div className="flex items-center justify-between">
                    <span className={`px-2 py-0.5 rounded text-[10px] font-semibold uppercase tracking-wider ${account.badgeColor}`}>
                      {account.role}
                    </span>
                    <span className="text-[10px] text-gray-500 font-medium">Click to fill</span>
                  </div>
                  <div className="font-mono mt-1 text-gray-700">
                    <div>Email: <span className="font-semibold text-gray-900">{account.email}</span></div>
                    <div>Pass: <span className="font-semibold text-gray-900">{account.password}</span></div>
                  </div>
                </button>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
