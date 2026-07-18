'use client';
import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { api } from '@/lib/api';
import toast from 'react-hot-toast';

export default function NewTenantPage() {
  const router = useRouter();
  const [loading, setLoading] = useState(false);
  const [formData, setFormData] = useState({
    name: '',
    phone: '',
    room_no: '',
    start_date: '',
    rent_amount: '',
    is_water_charge: false,
    water_charge: '',
    is_advanced: false
  });

  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const { name, value, type, checked } = e.target;
    setFormData(prev => ({
      ...prev,
      [name]: type === 'checkbox' ? checked : value
    }));
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    try {
      const payload = {
        ...formData,
        rent_amount: parseFloat(formData.rent_amount),
        water_charge: formData.water_charge ? parseFloat(formData.water_charge) : 0,
        start_date: formData.start_date || null
      };

      await api.post('/tenants', payload);
      toast.success('Tenant created successfully');
      router.push('/tenants');
    } catch (error: any) {
      toast.error(error.response?.data?.detail || 'Failed to create tenant');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="max-w-2xl mx-auto space-y-6">
      <h1 className="text-2xl font-bold text-gray-900">Add New Tenant</h1>
      <div className="bg-white p-6 rounded-xl shadow-sm border border-gray-100">
        <form onSubmit={handleSubmit} className="space-y-6">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            <div>
              <label className="block text-sm font-medium text-gray-700">Full Name</label>
              <input type="text" name="name" required value={formData.name} onChange={handleChange} className="mt-1 block w-full rounded-lg border-gray-300 shadow-sm focus:border-blue-500 focus:ring-blue-500" />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700">Phone Number</label>
              <input type="text" name="phone" value={formData.phone} onChange={handleChange} className="mt-1 block w-full rounded-lg border-gray-300 shadow-sm focus:border-blue-500 focus:ring-blue-500" />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700">Room Number</label>
              <input type="text" name="room_no" required value={formData.room_no} onChange={handleChange} className="mt-1 block w-full rounded-lg border-gray-300 shadow-sm focus:border-blue-500 focus:ring-blue-500" />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700">Start Date</label>
              <input type="date" name="start_date" required value={formData.start_date} onChange={handleChange} className="mt-1 block w-full rounded-lg border-gray-300 shadow-sm focus:border-blue-500 focus:ring-blue-500" />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700">Rent Amount (₹)</label>
              <input type="number" step="0.01" name="rent_amount" required value={formData.rent_amount} onChange={handleChange} className="mt-1 block w-full rounded-lg border-gray-300 shadow-sm focus:border-blue-500 focus:ring-blue-500" />
            </div>
          </div>
          
          <div className="space-y-4 pt-4 border-t border-gray-100">
            <div className="flex items-center">
              <input type="checkbox" id="is_water_charge" name="is_water_charge" checked={formData.is_water_charge} onChange={handleChange} className="h-4 w-4 text-blue-600 focus:ring-blue-500 border-gray-300 rounded" />
              <label htmlFor="is_water_charge" className="ml-2 block text-sm text-gray-900">Apply Water Charge</label>
            </div>
            {formData.is_water_charge && (
              <div>
                <label className="block text-sm font-medium text-gray-700">Water Charge Amount (₹)</label>
                <input type="number" step="0.01" name="water_charge" value={formData.water_charge} onChange={handleChange} className="mt-1 block w-full md:w-1/2 rounded-lg border-gray-300 shadow-sm focus:border-blue-500 focus:ring-blue-500" />
              </div>
            )}
            <div className="flex items-center">
              <input type="checkbox" id="is_advanced" name="is_advanced" checked={formData.is_advanced} onChange={handleChange} className="h-4 w-4 text-blue-600 focus:ring-blue-500 border-gray-300 rounded" />
              <label htmlFor="is_advanced" className="ml-2 block text-sm text-gray-900">Advance Paid (Skips rent on closing invoice)</label>
            </div>
          </div>
          
          <div className="pt-6 flex justify-end gap-3 border-t border-gray-100">
            <button type="button" onClick={() => router.push('/tenants')} className="px-4 py-2 border border-gray-300 rounded-lg text-sm font-medium text-gray-700 bg-white hover:bg-gray-50">Cancel</button>
            <button type="submit" disabled={loading} className="px-4 py-2 border border-transparent rounded-lg shadow-sm text-sm font-medium text-white bg-blue-600 hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500 disabled:bg-blue-400">
              {loading ? 'Creating...' : 'Save Tenant'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
