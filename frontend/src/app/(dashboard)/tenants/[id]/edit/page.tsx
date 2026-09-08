'use client';
import { useState, useEffect } from 'react';
import { useRouter, useParams } from 'next/navigation';
import { api } from '@/lib/api';
import { useAuth } from '@/hooks/useAuth';
import toast from 'react-hot-toast';
import { X, ChevronLeft, ChevronRight, Wallet, ArrowUpRight, ArrowDownRight, PlusCircle, RotateCw, Trash2, Calendar, FileText, History, Sparkles } from 'lucide-react';
import { format } from 'date-fns';

export default function EditTenantPage() {
  const router = useRouter();
  const params = useParams();
  const { user: currentUser } = useAuth();
  const tenantId = params?.id;

  const [loading, setLoading] = useState(false);
  const [fetching, setFetching] = useState(true);
  const [rooms, setRooms] = useState<any[]>([]);
  const [users, setUsers] = useState<any[]>([]);
  const [selectedFiles, setSelectedFiles] = useState<FileList | null>(null);
  
  // Image Viewer Modal State
  const [activeImageIndex, setActiveImageIndex] = useState<number | null>(null);
  const [aadhaarImages, setAadhaarImages] = useState<string[]>([]);

  const [walletBalance, setWalletBalance] = useState<number>(0);
  const [walletTransactions, setWalletTransactions] = useState<any[]>([]);
  const [loadingWalletTx, setLoadingWalletTx] = useState(false);
  const [showTxModal, setShowTxModal] = useState(false);
  const [dbHasWallet, setDbHasWallet] = useState(false);
  const [txData, setTxData] = useState({
    amount: '',
    transaction_type: 'credit',
    reason: '',
    reference: ''
  });

  const [formData, setFormData] = useState({
    name: '',
    phone: '',
    room_no: '',
    start_date: '',
    rent_amount: '',
    status: 'active',
    is_water_charge: false,
    water_charge: '',
    is_advanced: false,
    advance_amount: '',
    parent_id: '',
    manager_id: '',
    has_wallet: false,
    has_wifi: false,
    wifi_rate: ''
  });

  // Fetch tenant and room data on mount
  useEffect(() => {
    if (!tenantId) return;

    const fetchData = async () => {
      try {
        setFetching(true);
        // Fetch rooms
        const roomsRes = await api.get('/rooms');
        setRooms(roomsRes.data);

        // Fetch users if SA or Admin
        if (currentUser?.user_type === 'SA' || currentUser?.user_type === 'A') {
          const usersRes = await api.get('/users');
          setUsers(usersRes.data);
        }

        // Fetch tenant details
        const tenantRes = await api.get(`/tenants/${tenantId}`);
        const tenant = tenantRes.data;

        setFormData({
          name: tenant.name,
          phone: tenant.phone || '',
          room_no: tenant.room_no,
          start_date: tenant.start_date || '',
          rent_amount: tenant.rent_amount.toString(),
          status: tenant.status,
          is_water_charge: tenant.is_water_charge,
          water_charge: tenant.water_charge.toString(),
          is_advanced: tenant.is_advanced,
          advance_amount: tenant.advance_amount ? tenant.advance_amount.toString() : '',
          parent_id: tenant.parent_id.toString(),
          manager_id: tenant.manager_id ? tenant.manager_id.toString() : '',
          has_wallet: tenant.has_wallet,
          has_wifi: tenant.has_wifi,
          wifi_rate: tenant.wifi_rate ? tenant.wifi_rate.toString() : ''
        });

        setAadhaarImages(tenant.aadhaar_images || []);
        setDbHasWallet(tenant.has_wallet);
        if (tenant.has_wallet) {
          setWalletBalance(tenant.wallet_balance || 0);
          try {
            const txRes = await api.get(`/tenants/${tenantId}/wallet/transactions`);
            setWalletTransactions(txRes.data);
          } catch (err) {
            console.error('Failed to load transactions', err);
          }
        }
      } catch (err: any) {
        toast.error('Failed to load tenant details');
        router.push('/tenants');
      } finally {
        setFetching(false);
      }
    };

    fetchData();
  }, [tenantId, router, currentUser]);

  const handleParentChange = (e: React.ChangeEvent<HTMLSelectElement>) => {
    const parent_id = e.target.value;
    setFormData(prev => ({
      ...prev,
      parent_id,
      room_no: '',
      rent_amount: '',
      manager_id: ''
    }));
  };

  const handleChange = (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) => {
    const { name, value, type } = e.target;
    const checked = (e.target as HTMLInputElement).checked;

    setFormData(prev => {
      const updated = {
        ...prev,
        [name]: type === 'checkbox' ? checked : value
      };
      
      // If room changes, auto-populate the new default rent amount
      if (name === 'room_no') {
        const selectedRoom = rooms.find(r => r.room_no === value && (currentUser?.user_type !== 'SA' || r.parent_id === parseInt(prev.parent_id)));
        if (selectedRoom) {
          updated.rent_amount = selectedRoom.rent_amount.toString();
          if (updated.is_advanced) {
            updated.advance_amount = selectedRoom.rent_amount.toString();
          }
        }
      }

      if (name === 'is_advanced' && checked) {
        updated.advance_amount = prev.rent_amount;
      }
      if (name === 'rent_amount' && prev.is_advanced) {
        updated.advance_amount = value;
      }
      return updated;
    });
  };

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    setSelectedFiles(e.target.files);
  };

  const fetchWalletDetails = async () => {
    if (!tenantId) return;
    try {
      setLoadingWalletTx(true);
      const tenantRes = await api.get(`/tenants/${tenantId}`);
      setWalletBalance(tenantRes.data.wallet_balance || 0);

      const txRes = await api.get(`/tenants/${tenantId}/wallet/transactions`);
      setWalletTransactions(txRes.data);
    } catch (err) {
      console.error('Failed to load wallet details/transactions', err);
    } finally {
      setLoadingWalletTx(false);
    }
  };

  const handleRecordTransaction = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!txData.amount || parseFloat(txData.amount) <= 0) {
      toast.error('Please enter a valid amount greater than zero');
      return;
    }
    setLoading(true);
    try {
      const payload = {
        amount: parseFloat(txData.amount),
        transaction_type: txData.transaction_type,
        reason: txData.reason,
        reference: txData.reference || null
      };
      await api.post(`/tenants/${tenantId}/wallet/transaction`, payload);
      toast.success('Wallet transaction recorded successfully');
      setTxData({ amount: '', transaction_type: 'credit', reason: '', reference: '' });
      setShowTxModal(false);
      await fetchWalletDetails();
    } catch (err: any) {
      toast.error(err.response?.data?.detail || 'Failed to record transaction');
    } finally {
      setLoading(false);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (currentUser?.user_type === 'SA' && !formData.parent_id) {
      toast.error('Owner Admin is required');
      return;
    }
    setLoading(true);
    try {
      const payload = {
        ...formData,
        rent_amount: parseFloat(formData.rent_amount),
        water_charge: formData.water_charge ? parseFloat(formData.water_charge) : 0,
        advance_amount: formData.is_advanced && formData.advance_amount ? parseFloat(formData.advance_amount) : 0,
        wifi_rate: formData.has_wifi && formData.wifi_rate ? parseFloat(formData.wifi_rate) : 0,
        start_date: formData.start_date || null,
        parent_id: currentUser?.user_type === 'SA' ? parseInt(formData.parent_id) : currentUser?.id,
        manager_id: formData.manager_id ? parseInt(formData.manager_id) : null
      };

      // 1. Update Tenant Details
      await api.put(`/tenants/${tenantId}`, payload);

      // 2. Upload images if selected
      if (selectedFiles && selectedFiles.length > 0) {
        const uploadFormData = new FormData();
        for (let i = 0; i < selectedFiles.length; i++) {
          uploadFormData.append('files', selectedFiles[i]);
        }
        const { data: updatedTenant } = await api.post(`/tenants/${tenantId}/upload-aadhaar`, uploadFormData, {
          headers: {
            'Content-Type': 'multipart/form-data',
          },
        });
        setAadhaarImages(updatedTenant.aadhaar_images || []);
      }

      toast.success('Tenant updated successfully');
      router.push('/tenants');
    } catch (error: any) {
      toast.error(error.response?.data?.detail || 'Failed to update tenant');
    } finally {
      setLoading(false);
    }
  };

  const handlePrevImage = () => {
    if (activeImageIndex === null) return;
    setActiveImageIndex(prev => (prev === 0 ? aadhaarImages.length - 1 : (prev ?? 1) - 1));
  };

  const handleNextImage = () => {
    if (activeImageIndex === null) return;
    setActiveImageIndex(prev => (prev === aadhaarImages.length - 1 ? 0 : (prev ?? 0) + 1));
  };

  // Filter vacant rooms (or tenant's current room) based on owner
  const availableRooms = rooms.filter((room) => {
    const isVacantOrCurrent = room.status === 'vacant' || room.room_no === formData.room_no;
    if (currentUser?.user_type === 'SA') {
      return isVacantOrCurrent && formData.parent_id && room.parent_id === parseInt(formData.parent_id);
    }
    return isVacantOrCurrent;
  });

  // Get available managers
  const availableManagers = users.filter((u: any) => {
    const isManager = u.user_type === 'M';
    if (!isManager) return false;
    
    // Always include the currently assigned manager so the value shows up
    if (formData.manager_id && u.id === parseInt(formData.manager_id)) {
      return true;
    }
    
    if (currentUser?.user_type === 'SA') {
      return !u.parent_id || (formData.parent_id && u.parent_id === parseInt(formData.parent_id));
    }
    if (currentUser?.user_type === 'A') {
      return u.parent_id === currentUser.id;
    }
    return false;
  });

  if (fetching) return <div className="text-center py-10 dark:text-white">Loading details...</div>;

  return (
    <div className="max-w-2xl mx-auto space-y-6">
      <h1 className="text-2xl font-bold text-gray-900 dark:text-white">Edit Tenant</h1>
      <div className="bg-white dark:bg-gray-800 p-6 rounded-xl shadow-sm border border-gray-100 dark:border-gray-700">
        <form onSubmit={handleSubmit} className="space-y-6">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            <div>
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300">Full Name</label>
              <input type="text" name="name" required value={formData.name} onChange={handleChange} className="mt-1 block w-full rounded-lg border-gray-300 dark:border-gray-600 dark:bg-gray-700 dark:text-white shadow-sm focus:border-blue-500 focus:ring-blue-500" />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300">Phone Number</label>
              <input type="text" name="phone" value={formData.phone} onChange={handleChange} className="mt-1 block w-full rounded-lg border-gray-300 dark:border-gray-600 dark:bg-gray-700 dark:text-white shadow-sm focus:border-blue-500 focus:ring-blue-500" />
            </div>

            {currentUser?.user_type === 'SA' && (
              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300">Owner Admin</label>
                <select 
                  name="parent_id" 
                  required 
                  value={formData.parent_id} 
                  onChange={handleParentChange} 
                  className="mt-1 block w-full rounded-lg border-gray-300 dark:border-gray-600 dark:bg-gray-700 dark:text-white shadow-sm focus:border-blue-500 focus:ring-blue-500"
                >
                  <option value="">-- Select Owner Admin --</option>
                  {users
                    .filter(u => u.user_type === 'A' || u.id === parseInt(formData.parent_id))
                    .map(admin => (
                      <option key={admin.id} value={admin.id}>
                        {admin.name} ({admin.email}){admin.user_type === 'SA' ? ' - Super Admin' : ''}
                      </option>
                    ))}
                </select>
              </div>
            )}

            {(currentUser?.user_type === 'SA' || currentUser?.user_type === 'A') && (
              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300">Assigned Manager</label>
                <select 
                  name="manager_id" 
                  value={formData.manager_id} 
                  onChange={handleChange} 
                  className="mt-1 block w-full rounded-lg border-gray-300 dark:border-gray-600 dark:bg-gray-700 dark:text-white shadow-sm focus:border-blue-500 focus:ring-blue-500"
                >
                  <option value="">-- No Assigned Manager (Self) --</option>
                  {availableManagers.map(m => (
                    <option key={m.id} value={m.id}>{m.name} ({m.email})</option>
                  ))}
                </select>
              </div>
            )}

            <div>
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300">Room Number</label>
              <select 
                name="room_no" 
                required 
                value={formData.room_no} 
                onChange={handleChange} 
                className="mt-1 block w-full rounded-lg border-gray-300 dark:border-gray-600 dark:bg-gray-700 dark:text-white shadow-sm focus:border-blue-500 focus:ring-blue-500"
              >
                <option value="">Select Room</option>
                {availableRooms.map((room) => (
                  <option key={room.id} value={room.room_no}>
                    {room.room_no} (Rent: ₹{room.rent_amount})
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300">Start Date</label>
              <input type="date" name="start_date" required value={formData.start_date} onChange={handleChange} className="mt-1 block w-full rounded-lg border-gray-300 dark:border-gray-600 dark:bg-gray-700 dark:text-white shadow-sm focus:border-blue-500 focus:ring-blue-500" />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300">Rent Amount (₹)</label>
              <input type="number" step="0.01" name="rent_amount" required value={formData.rent_amount} onChange={handleChange} className="mt-1 block w-full rounded-lg border-gray-300 dark:border-gray-600 dark:bg-gray-700 dark:text-white shadow-sm focus:border-blue-500 focus:ring-blue-500" />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300">Tenant Status</label>
              <select name="status" value={formData.status} onChange={handleChange} className="mt-1 block w-full rounded-lg border-gray-300 dark:border-gray-600 dark:bg-gray-700 dark:text-white shadow-sm focus:border-blue-500 focus:ring-blue-500">
                <option value="active">Active</option>
                <option value="close">Closed</option>
              </select>
            </div>
          </div>
          
          <div className="space-y-4 pt-4 border-t border-gray-100 dark:border-gray-700">
            <div className="flex items-center">
              <input type="checkbox" id="is_water_charge" name="is_water_charge" checked={formData.is_water_charge} onChange={handleChange} className="h-4 w-4 text-blue-600 focus:ring-blue-500 border-gray-300 rounded dark:bg-gray-700 dark:border-gray-600" />
              <label htmlFor="is_water_charge" className="ml-2 block text-sm text-gray-900 dark:text-gray-300">Apply Water Charge</label>
            </div>
            {formData.is_water_charge && (
              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300">Water Charge Amount (₹)</label>
                <input type="number" step="0.01" name="water_charge" value={formData.water_charge} onChange={handleChange} className="mt-1 block w-full md:w-1/2 rounded-lg border-gray-300 dark:border-gray-600 dark:bg-gray-700 dark:text-white shadow-sm focus:border-blue-500 focus:ring-blue-500" />
              </div>
            )}
            <div className="flex items-center">
              <input type="checkbox" id="is_advanced" name="is_advanced" checked={formData.is_advanced} onChange={handleChange} className="h-4 w-4 text-blue-600 focus:ring-blue-500 border-gray-300 rounded dark:bg-gray-700 dark:border-gray-600" />
              <label htmlFor="is_advanced" className="ml-2 block text-sm text-gray-900 dark:text-gray-300">Advance Paid (Skips rent on closing invoice)</label>
            </div>
            {formData.is_advanced && (
              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300">Advance Amount (₹)</label>
                <input type="number" step="0.01" name="advance_amount" value={formData.advance_amount} onChange={handleChange} className="mt-1 block w-full md:w-1/2 rounded-lg border-gray-300 dark:border-gray-600 dark:bg-gray-700 dark:text-white shadow-sm focus:border-blue-500 focus:ring-blue-500" />
              </div>
            )}
            <div className="flex items-center">
              <input type="checkbox" id="has_wallet" name="has_wallet" checked={formData.has_wallet} onChange={handleChange} className="h-4 w-4 text-blue-600 focus:ring-blue-500 border-gray-300 rounded dark:bg-gray-700 dark:border-gray-600" />
              <label htmlFor="has_wallet" className="ml-2 block text-sm text-gray-900 dark:text-gray-300">Enable Digital Wallet</label>
            </div>
            <div className="flex items-center">
              <input type="checkbox" id="has_wifi" name="has_wifi" checked={formData.has_wifi} onChange={handleChange} className="h-4 w-4 text-blue-600 focus:ring-blue-500 border-gray-300 rounded dark:bg-gray-700 dark:border-gray-600" />
              <label htmlFor="has_wifi" className="ml-2 block text-sm text-gray-900 dark:text-gray-300">Enable Wi-Fi Service</label>
            </div>
            {formData.has_wifi && (
              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300">Wi-Fi Rate (₹/month)</label>
                <input type="number" step="0.01" name="wifi_rate" value={formData.wifi_rate} onChange={handleChange} className="mt-1 block w-full md:w-1/2 rounded-lg border-gray-300 dark:border-gray-600 dark:bg-gray-700 dark:text-white shadow-sm focus:border-blue-500 focus:ring-blue-500" required />
              </div>
            )}
          </div>

          {/* Media Section */}
          <div className="space-y-4 pt-4 border-t border-gray-100 dark:border-gray-700">
            <h3 className="text-sm font-semibold text-gray-700 dark:text-gray-300">Tenant Media / Documents</h3>
            
            {/* Gallery Grid */}
            {aadhaarImages.length > 0 ? (
              <div className="grid grid-cols-3 sm:grid-cols-4 gap-4">
                {aadhaarImages.map((imagePath, index) => (
                  <div 
                    key={index} 
                    className="relative aspect-square rounded-lg border dark:border-gray-700 overflow-hidden cursor-pointer group hover:opacity-90 transition-opacity bg-gray-50 dark:bg-gray-900 flex items-center justify-center"
                    onClick={() => setActiveImageIndex(index)}
                  >
                    <img 
                      src={`http://localhost:8000${imagePath}`} 
                      alt={`Document ${index + 1}`} 
                      className="object-cover w-full h-full"
                      onError={(e) => {
                        (e.target as HTMLImageElement).src = imagePath;
                      }}
                    />
                    <div className="absolute inset-0 bg-black/40 opacity-0 group-hover:opacity-100 flex items-center justify-center text-white text-xs font-semibold transition-opacity">
                      View Large
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <p className="text-xs text-gray-500">No documents uploaded yet.</p>
            )}

            {/* Upload Input */}
            <div>
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300">Upload More Images</label>
              <input 
                type="file" 
                multiple 
                accept="image/*" 
                onChange={handleFileChange} 
                className="mt-1 block w-full text-sm text-gray-500 dark:text-gray-400 file:mr-4 file:py-2 file:px-4 file:rounded-lg file:border-0 file:text-sm file:font-semibold file:bg-blue-50 file:text-blue-700 hover:file:bg-blue-100 dark:file:bg-gray-700 dark:file:text-gray-300"
              />
            </div>
          </div>
          
          <div className="pt-6 flex justify-end gap-3 border-t border-gray-100 dark:border-gray-700">
            <button type="button" onClick={() => router.push('/tenants')} className="px-4 py-2 border border-gray-300 dark:border-gray-600 rounded-lg text-sm font-medium text-gray-700 dark:text-gray-300 bg-white dark:bg-gray-700 hover:bg-gray-50 dark:hover:bg-gray-600">Cancel</button>
            <button type="submit" disabled={loading} className="px-4 py-2 border border-transparent rounded-lg shadow-sm text-sm font-medium text-white bg-blue-600 hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500 disabled:bg-blue-400">
              {loading ? 'Saving...' : 'Save Changes'}
            </button>
          </div>
        </form>
      </div>

      {formData.has_wallet && (
        <div className="bg-white dark:bg-gray-800 p-6 rounded-xl shadow-sm border border-gray-100 dark:border-gray-700 space-y-6">
          <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4 pb-4 border-b border-gray-100 dark:border-gray-700">
            <div className="flex items-center gap-3">
              <div className="p-2 bg-blue-50 dark:bg-blue-900/30 rounded-lg text-blue-600 dark:text-blue-400">
                <Wallet className="h-6 w-6" />
              </div>
              <div>
                <h2 className="text-lg font-bold text-gray-900 dark:text-white">Tenant Digital Wallet</h2>
                <p className="text-xs text-gray-500 dark:text-gray-400">Manage tenant credits, payments, and advance adjustments</p>
              </div>
            </div>
            {dbHasWallet && (
              <div className="flex items-center gap-2">
                <div className="text-right">
                  <div className="text-xs text-gray-500 dark:text-gray-400 font-medium">Available Balance</div>
                  <div className="text-2xl font-black text-gray-900 dark:text-white">₹{walletBalance.toFixed(2)}</div>
                </div>
                <button
                  type="button"
                  onClick={() => fetchWalletDetails()}
                  className="p-2 text-gray-500 hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-700 rounded-lg"
                  title="Refresh Wallet Balance"
                >
                  <RotateCw className={`h-4 w-4 ${loadingWalletTx ? 'animate-spin' : ''}`} />
                </button>
              </div>
            )}
          </div>

          {!dbHasWallet ? (
            <div className="p-4 bg-yellow-50/50 dark:bg-yellow-900/10 border border-yellow-250 dark:border-yellow-800/30 rounded-xl flex items-start gap-3">
              <Sparkles className="h-5 w-5 text-yellow-600 dark:text-yellow-450 shrink-0 mt-0.5 animate-pulse" />
              <div>
                <h3 className="text-sm font-semibold text-yellow-800 dark:text-yellow-250">Wallet Activation Pending</h3>
                <p className="text-xs text-yellow-750 dark:text-yellow-400 mt-0.5">
                  You have enabled the digital wallet in the form. Please click the <strong>"Save Changes"</strong> button in the form above first to save this tenant and activate their wallet.
                </p>
              </div>
            </div>
          ) : (
            <>
              {(currentUser?.user_type === 'SA' || currentUser?.user_type === 'A') && (
                <div className="flex justify-start">
                  <button
                    type="button"
                    onClick={() => setShowTxModal(true)}
                    className="flex items-center px-4 py-2 text-sm font-semibold bg-blue-600 text-white hover:bg-blue-700 rounded-lg shadow-sm transition-colors animate-pulse-slow"
                  >
                    <PlusCircle className="h-4 w-4 mr-2" />
                    Add/Deduct Money
                  </button>
                </div>
              )}

              {/* Wallet Transaction History */}
              <div className="space-y-3">
                <h3 className="text-sm font-semibold text-gray-700 dark:text-gray-300 flex items-center gap-2">
                  <History className="h-4 w-4 text-gray-500" />
                  Transaction History
                </h3>

                <div className="overflow-x-auto rounded-lg border border-gray-100 dark:border-gray-700">
                  <table className="min-w-full divide-y divide-gray-200 dark:divide-gray-700">
                    <thead className="bg-gray-50 dark:bg-gray-900/50">
                      <tr>
                        <th className="px-4 py-3 text-left text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase">Date/Time</th>
                        <th className="px-4 py-3 text-left text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase">Type</th>
                        <th className="px-4 py-3 text-left text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase">Amount</th>
                        <th className="px-4 py-3 text-left text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase">Running Balance</th>
                        <th className="px-4 py-3 text-left text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase">Reason/Ref</th>
                        <th className="px-4 py-3 text-left text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase">Admin</th>
                      </tr>
                    </thead>
                    <tbody className="bg-white dark:bg-gray-800 divide-y divide-gray-250 dark:divide-gray-700 text-sm">
                      {walletTransactions.length === 0 ? (
                        <tr>
                          <td colSpan={6} className="px-4 py-6 text-center text-gray-500 dark:text-gray-400 font-medium">
                            No wallet transactions found.
                          </td>
                        </tr>
                      ) : (
                        walletTransactions.map((tx) => (
                          <tr key={tx.id} className="hover:bg-gray-50 dark:hover:bg-gray-700/40">
                            <td className="px-4 py-3 whitespace-nowrap text-xs text-gray-500 dark:text-gray-400 font-medium">
                              {format(new Date(tx.created_at), 'MMM d, yyyy h:mm a')}
                            </td>
                            <td className="px-4 py-3 whitespace-nowrap">
                              <span className={`px-2 py-0.5 inline-flex text-xs font-bold rounded-full items-center gap-1 ${
                                tx.transaction_type === 'credit' 
                                  ? 'bg-green-50 text-green-700 dark:bg-green-900/20 dark:text-green-400' 
                                  : 'bg-red-50 text-red-700 dark:bg-red-900/20 dark:text-red-400'
                              }`}>
                                {tx.transaction_type === 'credit' ? (
                                  <ArrowUpRight className="h-3 w-3" />
                                ) : (
                                  <ArrowDownRight className="h-3 w-3" />
                                )}
                                {tx.transaction_type.toUpperCase()}
                              </span>
                            </td>
                            <td className="px-4 py-3 whitespace-nowrap font-bold text-gray-900 dark:text-white">
                              ₹{tx.amount.toFixed(2)}
                            </td>
                            <td className="px-4 py-3 whitespace-nowrap text-gray-600 dark:text-gray-300 font-bold">
                              ₹{tx.running_balance.toFixed(2)}
                            </td>
                            <td className="px-4 py-3">
                              <div className="font-semibold text-gray-900 dark:text-white">{tx.reason || 'N/A'}</div>
                              {tx.reference && (
                                <div className="text-xs text-gray-500 dark:text-gray-400 font-mono">Ref: {tx.reference}</div>
                              )}
                              {tx.invoice_id && (
                                <div className="text-xs text-blue-600 dark:text-blue-400 font-semibold flex items-center gap-1 mt-0.5">
                                  <FileText className="h-3 w-3" />
                                  Invoice Month: {tx.invoice_month || 'Invoice Details'}
                                </div>
                              )}
                            </td>
                            <td className="px-4 py-3 whitespace-nowrap text-xs text-gray-600 dark:text-gray-400 font-medium">
                              {tx.performed_by_name || `User #${tx.performed_by}`}
                            </td>
                          </tr>
                        ))
                      )}
                    </tbody>
                  </table>
                </div>
              </div>
            </>
          )}
        </div>
      )}

      {/* Transaction Recording Modal */}
      {showTxModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4">
          <div className="bg-white dark:bg-gray-800 rounded-xl shadow-xl border border-gray-100 dark:border-gray-700 max-w-md w-full overflow-hidden animate-slide-up">
            <div className="flex justify-between items-center px-6 py-4 border-b border-gray-100 dark:border-gray-700 bg-gray-50 dark:bg-gray-900/50">
              <h3 className="text-lg font-bold text-gray-900 dark:text-white flex items-center gap-2">
                <Wallet className="h-5 w-5 text-blue-500" />
                Add/Deduct Wallet Balance
              </h3>
              <button onClick={() => setShowTxModal(false)} className="p-1 rounded-lg text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-700">
                <X className="h-5 w-5" />
              </button>
            </div>
            <form onSubmit={handleRecordTransaction} className="p-6 space-y-4">
              <div>
                <label className="block text-sm font-semibold text-gray-700 dark:text-gray-300">Transaction Type</label>
                <select
                  value={txData.transaction_type}
                  onChange={(e) => setTxData(prev => ({ ...prev, transaction_type: e.target.value }))}
                  className="mt-1 block w-full rounded-lg border-gray-300 dark:border-gray-600 dark:bg-gray-700 dark:text-white shadow-sm focus:border-blue-500 focus:ring-blue-500"
                >
                  <option value="credit">Credit (Tenant Paid Advance/Cash Top-up)</option>
                  <option value="debit">Debit (Deduction/Manual Charge)</option>
                </select>
              </div>

              <div>
                <label className="block text-sm font-semibold text-gray-700 dark:text-gray-300">Amount (₹)</label>
                <input
                  type="number"
                  step="0.01"
                  required
                  placeholder="0.00"
                  value={txData.amount}
                  onChange={(e) => setTxData(prev => ({ ...prev, amount: e.target.value }))}
                  className="mt-1 block w-full rounded-lg border-gray-300 dark:border-gray-600 dark:bg-gray-700 dark:text-white shadow-sm focus:border-blue-500 focus:ring-blue-500"
                />
              </div>

              <div>
                <label className="block text-sm font-semibold text-gray-700 dark:text-gray-300">Reason / Description</label>
                <input
                  type="text"
                  required
                  placeholder="e.g. Rent paid in advance"
                  value={txData.reason}
                  onChange={(e) => setTxData(prev => ({ ...prev, reason: e.target.value }))}
                  className="mt-1 block w-full rounded-lg border-gray-300 dark:border-gray-600 dark:bg-gray-700 dark:text-white shadow-sm focus:border-blue-500 focus:ring-blue-500"
                />
              </div>

              <div>
                <label className="block text-sm font-semibold text-gray-700 dark:text-gray-300">Reference (Optional)</label>
                <input
                  type="text"
                  placeholder="e.g. GPay/UPI Transaction ID, Cash Receipt"
                  value={txData.reference}
                  onChange={(e) => setTxData(prev => ({ ...prev, reference: e.target.value }))}
                  className="mt-1 block w-full rounded-lg border-gray-300 dark:border-gray-600 dark:bg-gray-700 dark:text-white shadow-sm focus:border-blue-500 focus:ring-blue-500"
                />
              </div>

              <div className="pt-4 flex justify-end gap-3 border-t border-gray-100 dark:border-gray-700">
                <button
                  type="button"
                  onClick={() => setShowTxModal(false)}
                  className="px-4 py-2 border border-gray-300 dark:border-gray-600 rounded-lg text-sm font-medium text-gray-700 dark:text-gray-300 bg-white dark:bg-gray-700 hover:bg-gray-50 dark:hover:bg-gray-600"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={loading}
                  className="px-4 py-2 border border-transparent rounded-lg shadow-sm text-sm font-medium text-white bg-blue-600 hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500 disabled:bg-blue-400"
                >
                  {loading ? 'Recording...' : 'Submit Transaction'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Full-Screen Image Popup Modal */}
      {activeImageIndex !== null && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/90 p-4 select-none">
          <button 
            onClick={() => setActiveImageIndex(null)}
            className="absolute top-4 right-4 p-2 text-white/75 hover:text-white bg-white/10 hover:bg-white/20 rounded-full transition-colors"
            title="Close Viewer"
          >
            <X className="h-6 w-6" />
          </button>

          {aadhaarImages.length > 1 && (
            <>
              <button 
                onClick={handlePrevImage}
                className="absolute left-4 p-3 text-white/75 hover:text-white bg-white/10 hover:bg-white/20 rounded-full transition-colors"
                title="Previous Image"
              >
                <ChevronLeft className="h-6 w-6" />
              </button>
              <button 
                onClick={handleNextImage}
                className="absolute right-4 p-3 text-white/75 hover:text-white bg-white/10 hover:bg-white/20 rounded-full transition-colors"
                title="Next Image"
              >
                <ChevronRight className="h-6 w-6" />
              </button>
            </>
          )}

          <div className="max-w-4xl max-h-[85vh] flex items-center justify-center">
            <img 
              src={`http://localhost:8000${aadhaarImages[activeImageIndex]}`} 
              alt="Document Large Preview" 
              className="max-w-full max-h-full object-contain rounded-lg shadow-2xl border border-white/10"
              onError={(e) => {
                (e.target as HTMLImageElement).src = aadhaarImages[activeImageIndex];
              }}
            />
          </div>
          
          <div className="absolute bottom-4 text-white/60 text-sm">
            Image {activeImageIndex + 1} of {aadhaarImages.length}
          </div>
        </div>
      )}
    </div>
  );
}
