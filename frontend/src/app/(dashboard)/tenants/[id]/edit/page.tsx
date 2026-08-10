'use client';
import { useState, useEffect } from 'react';
import { useRouter, useParams } from 'next/navigation';
import { api } from '@/lib/api';
import { useAuth } from '@/hooks/useAuth';
import toast from 'react-hot-toast';
import { X, ChevronLeft, ChevronRight } from 'lucide-react';

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
    manager_id: ''
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
          manager_id: tenant.manager_id ? tenant.manager_id.toString() : ''
        });

        setAadhaarImages(tenant.aadhaar_images || []);
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
    if (currentUser?.user_type === 'SA') {
      return isManager && formData.parent_id && u.parent_id === parseInt(formData.parent_id);
    }
    if (currentUser?.user_type === 'A') {
      return isManager && u.parent_id === currentUser.id;
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
                  {users.filter(u => u.user_type === 'A').map(admin => (
                    <option key={admin.id} value={admin.id}>{admin.name} ({admin.email})</option>
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
