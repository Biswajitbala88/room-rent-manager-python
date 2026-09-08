'use client';
import { useEffect, useState } from 'react';
import { useAuth } from '@/hooks/useAuth';
import { api } from '@/lib/api';
import toast from 'react-hot-toast';
import { RefreshCw } from 'lucide-react';

const SYNC_ENABLED = process.env.NEXT_PUBLIC_ENABLE_SYNC === 'true';

export default function ProfilePage() {
  const { user, fetchUser } = useAuth();

  const [profileData, setProfileData] = useState({
    name: user?.name || '',
    email: user?.email || '',
  });

  const [passwordData, setPasswordData] = useState({
    current_password: '',
    new_password: '',
    confirm_password: ''
  });

  const [loadingProfile, setLoadingProfile] = useState(false);
  const [loadingPassword, setLoadingPassword] = useState(false);

  const showSync = SYNC_ENABLED && user?.user_type === 'SA';
  const [syncing, setSyncing] = useState(false);
  const [syncHistory, setSyncHistory] = useState<any[]>([]);

  const fetchSyncHistory = async () => {
    try {
      const { data } = await api.get('/sync/history');
      setSyncHistory(data);
    } catch (error) {
      // Sync endpoints are only reachable in local/dev; a failure here is expected in prod.
    }
  };

  useEffect(() => {
    if (showSync) {
      fetchSyncHistory();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [showSync]);

  const handleSync = async () => {
    setSyncing(true);
    try {
      const { data } = await api.post('/sync/run');
      const summaryText = Object.entries(data.summary || {})
        .map(([table, count]) => `${table}: ${count}`)
        .join(', ');
      toast.success(`Sync complete — ${summaryText}`);
      fetchSyncHistory();
    } catch (error: any) {
      toast.error(error.response?.data?.detail || 'Sync failed');
    } finally {
      setSyncing(false);
    }
  };

  const handleProfileUpdate = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoadingProfile(true);
    try {
      await api.patch('/auth/me', profileData);
      await fetchUser();
      toast.success('Profile updated successfully');
    } catch (error: any) {
      toast.error(error.response?.data?.detail || 'Failed to update profile');
    } finally {
      setLoadingProfile(false);
    }
  };

  const handlePasswordUpdate = async (e: React.FormEvent) => {
    e.preventDefault();
    if (passwordData.new_password !== passwordData.confirm_password) {
      toast.error('New passwords do not match');
      return;
    }
    
    setLoadingPassword(true);
    try {
      await api.patch('/auth/me/password', {
        current_password: passwordData.current_password,
        new_password: passwordData.new_password
      });
      toast.success('Password changed successfully');
      setPasswordData({ current_password: '', new_password: '', confirm_password: '' });
    } catch (error: any) {
      toast.error(error.response?.data?.detail || 'Failed to change password');
    } finally {
      setLoadingPassword(false);
    }
  };

  return (
    <div className="max-w-4xl mx-auto space-y-8">
      <h1 className="text-2xl font-bold text-gray-900 dark:text-white">My Profile</h1>
      
      <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
        {/* Profile Settings */}
        <div className="bg-white dark:bg-gray-800 p-6 rounded-xl shadow-sm border border-gray-100 dark:border-gray-700 h-fit">
          <h2 className="text-lg font-semibold text-gray-900 dark:text-white mb-6">Profile Settings</h2>
          <form onSubmit={handleProfileUpdate} className="space-y-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300">Name</label>
              <input 
                type="text" 
                value={profileData.name}
                onChange={e => setProfileData({...profileData, name: e.target.value})}
                required
                className="mt-1 block w-full rounded-lg border-gray-300 shadow-sm focus:border-blue-500 focus:ring-blue-500" 
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300">Email Address</label>
              <input 
                type="email" 
                value={profileData.email}
                onChange={e => setProfileData({...profileData, email: e.target.value})}
                required
                className="mt-1 block w-full rounded-lg border-gray-300 shadow-sm focus:border-blue-500 focus:ring-blue-500" 
              />
            </div>
            <div className="pt-4">
              <button 
                type="submit" 
                disabled={loadingProfile}
                className="w-full flex justify-center py-2 px-4 border border-transparent rounded-lg shadow-sm text-sm font-medium text-white bg-blue-600 hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500 disabled:bg-blue-400"
              >
                {loadingProfile ? 'Updating...' : 'Update Profile'}
              </button>
            </div>
          </form>
        </div>

        {/* Change Password */}
        <div className="bg-white dark:bg-gray-800 p-6 rounded-xl shadow-sm border border-gray-100 dark:border-gray-700 h-fit">
          <h2 className="text-lg font-semibold text-gray-900 dark:text-white mb-6">Change Password</h2>
          <form onSubmit={handlePasswordUpdate} className="space-y-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300">Current Password</label>
              <input 
                type="password" 
                value={passwordData.current_password}
                onChange={e => setPasswordData({...passwordData, current_password: e.target.value})}
                required
                className="mt-1 block w-full rounded-lg border-gray-300 shadow-sm focus:border-blue-500 focus:ring-blue-500" 
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300">New Password</label>
              <input 
                type="password" 
                value={passwordData.new_password}
                onChange={e => setPasswordData({...passwordData, new_password: e.target.value})}
                required
                className="mt-1 block w-full rounded-lg border-gray-300 shadow-sm focus:border-blue-500 focus:ring-blue-500" 
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300">Confirm New Password</label>
              <input 
                type="password" 
                value={passwordData.confirm_password}
                onChange={e => setPasswordData({...passwordData, confirm_password: e.target.value})}
                required
                className="mt-1 block w-full rounded-lg border-gray-300 shadow-sm focus:border-blue-500 focus:ring-blue-500" 
              />
            </div>
            <div className="pt-4">
              <button 
                type="submit" 
                disabled={loadingPassword}
                className="w-full flex justify-center py-2 px-4 border border-transparent rounded-lg shadow-sm text-sm font-medium text-white bg-gray-900 dark:bg-gray-700 hover:bg-gray-800 dark:hover:bg-gray-600 focus:outline-none focus:ring-2 focus:ring-offset-2 dark:focus:ring-offset-gray-800 focus:ring-gray-900 dark:focus:ring-gray-500 disabled:bg-gray-400"
              >
                {loadingPassword ? 'Changing...' : 'Change Password'}
              </button>
            </div>
          </form>
        </div>
      </div>

      {showSync && (
        <div className="bg-white dark:bg-gray-800 p-6 rounded-xl shadow-sm border border-gray-100 dark:border-gray-700">
          <h2 className="text-lg font-semibold text-gray-900 dark:text-white mb-1">Developer Tools</h2>
          <p className="text-sm text-gray-500 dark:text-gray-400 mb-6">
            Copy data from the remote/production database into this local database for testing.
            This never writes to the remote database, and running it repeatedly is safe.
          </p>
          <button
            type="button"
            onClick={handleSync}
            disabled={syncing}
            className="flex items-center px-4 py-2 border border-transparent rounded-lg shadow-sm text-sm font-medium text-white bg-blue-600 hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500 disabled:bg-blue-400"
          >
            <RefreshCw className={`h-4 w-4 mr-2 ${syncing ? 'animate-spin' : ''}`} />
            {syncing ? 'Syncing...' : 'Sync Data from Remote'}
          </button>

          {syncHistory.length > 0 && (
            <div className="mt-6">
              <h3 className="text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase mb-2">Recent Syncs</h3>
              <div className="space-y-2">
                {syncHistory.map((log) => (
                  <div key={log.id} className="flex items-center justify-between text-sm border border-gray-100 dark:border-gray-700 rounded-lg px-3 py-2">
                    <div>
                      <span className={`font-medium ${log.status === 'success' ? 'text-green-600 dark:text-green-400' : log.status === 'failed' ? 'text-red-600 dark:text-red-400' : 'text-gray-500 dark:text-gray-400'}`}>
                        {log.status}
                      </span>
                      <span className="text-gray-400 dark:text-gray-500 ml-2">
                        {new Date(log.started_at).toLocaleString()}
                      </span>
                    </div>
                    {log.summary && (
                      <span className="text-gray-500 dark:text-gray-400 text-xs">
                        {Object.entries(log.summary).map(([table, count]) => `${table}: ${count}`).join(', ')}
                      </span>
                    )}
                    {log.error_message && (
                      <span className="text-red-500 dark:text-red-400 text-xs truncate max-w-xs" title={log.error_message}>
                        {log.error_message}
                      </span>
                    )}
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
