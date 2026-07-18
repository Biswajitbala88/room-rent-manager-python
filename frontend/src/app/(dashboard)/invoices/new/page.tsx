'use client';
import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { api } from '@/lib/api';
import toast from 'react-hot-toast';
import { format } from 'date-fns';

export default function NewInvoicePage() {
  const router = useRouter();
  const [loading, setLoading] = useState(false);
  const [tenants, setTenants] = useState<any[]>([]);
  
  const [formData, setFormData] = useState({
    tenant_id: '',
    month: format(new Date(), 'yyyy-MM'),
    electricity_units: 0,
    water_charge: 0,
    received_amount: 0,
    is_closer: false,
    is_excluded: false
  });

  const [lastUnits, setLastUnits] = useState<number | null>(null);

  useEffect(() => {
    const fetchTenants = async () => {
      try {
        const { data } = await api.get('/tenants');
        setTenants(data.filter((t: any) => t.status === 'active'));
      } catch (error) {
        toast.error('Failed to fetch tenants');
      }
    };
    fetchTenants();
  }, []);

  const handleTenantChange = async (e: React.ChangeEvent<HTMLSelectElement>) => {
    const tenant_id = e.target.value;
    setFormData(prev => ({ ...prev, tenant_id }));
    
    if (tenant_id && formData.month) {
      const selectedTenant = tenants.find(t => t.id === parseInt(tenant_id));
      if (selectedTenant) {
        try {
          const { data } = await api.get(`/invoices/last-units/${selectedTenant.room_no}/${formData.month}`);
          setLastUnits(data.last_units);
          
          if (selectedTenant.is_water_charge) {
            setFormData(prev => ({ ...prev, water_charge: selectedTenant.water_charge }));
          }
        } catch (error) {
          console.error("Failed to fetch last units");
        }
      }
    }
  };

  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const { name, value, type, checked } = e.target;
    setFormData(prev => ({
      ...prev,
      [name]: type === 'checkbox' ? checked : (type === 'number' ? parseFloat(value) || 0 : value)
    }));
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    try {
      await api.post('/invoices', {
        ...formData,
        tenant_id: parseInt(formData.tenant_id)
      });
      toast.success('Invoice created successfully');
      router.push('/invoices');
    } catch (error: any) {
      toast.error(error.response?.data?.detail || 'Failed to create invoice');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="max-w-2xl mx-auto space-y-6">
      <h1 className="text-2xl font-bold text-gray-900">Generate Invoice</h1>
      <div className="bg-white p-6 rounded-xl shadow-sm border border-gray-100">
        <form onSubmit={handleSubmit} className="space-y-6">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            <div>
              <label className="block text-sm font-medium text-gray-700">Select Tenant / Room</label>
              <select name="tenant_id" required value={formData.tenant_id} onChange={handleTenantChange} className="mt-1 block w-full rounded-lg border-gray-300 shadow-sm focus:border-blue-500 focus:ring-blue-500">
                <option value="">-- Select Tenant --</option>
                {tenants.map(t => (
                  <option key={t.id} value={t.id}>{t.name} (Room {t.room_no})</option>
                ))}
              </select>
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700">Billing Month</label>
              <input type="month" name="month" required value={formData.month} onChange={handleChange} className="mt-1 block w-full rounded-lg border-gray-300 shadow-sm focus:border-blue-500 focus:ring-blue-500" />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700">Electricity Units</label>
              <div className="mt-1 flex items-center space-x-2">
                <input type="number" name="electricity_units" required min="0" value={formData.electricity_units} onChange={handleChange} className="block w-full rounded-lg border-gray-300 shadow-sm focus:border-blue-500 focus:ring-blue-500" />
                {lastUnits !== null && (
                  <span className="text-xs text-gray-500 whitespace-nowrap">Last: {lastUnits}</span>
                )}
              </div>
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700">Water Charge (₹)</label>
              <input type="number" step="0.01" name="water_charge" required value={formData.water_charge} onChange={handleChange} className="mt-1 block w-full rounded-lg border-gray-300 shadow-sm focus:border-blue-500 focus:ring-blue-500" />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700">Received Amount (₹)</label>
              <input type="number" step="0.01" name="received_amount" required min="0" value={formData.received_amount} onChange={handleChange} className="mt-1 block w-full rounded-lg border-gray-300 shadow-sm focus:border-blue-500 focus:ring-blue-500" />
            </div>
          </div>
          
          <div className="space-y-4 pt-4 border-t border-gray-100">
            <div className="flex items-center">
              <input type="checkbox" id="is_closer" name="is_closer" checked={formData.is_closer} onChange={handleChange} className="h-4 w-4 text-blue-600 focus:ring-blue-500 border-gray-300 rounded" />
              <label htmlFor="is_closer" className="ml-2 block text-sm text-gray-900 font-medium text-red-600">Close Tenant Account (Closing Invoice)</label>
            </div>
            <div className="flex items-center">
              <input type="checkbox" id="is_excluded" name="is_excluded" checked={formData.is_excluded} onChange={handleChange} className="h-4 w-4 text-blue-600 focus:ring-blue-500 border-gray-300 rounded" />
              <label htmlFor="is_excluded" className="ml-2 block text-sm text-gray-900">Exclude from Dashboard & Electricity Report</label>
            </div>
          </div>
          
          <div className="pt-6 flex justify-end gap-3 border-t border-gray-100">
            <button type="button" onClick={() => router.push('/invoices')} className="px-4 py-2 border border-gray-300 rounded-lg text-sm font-medium text-gray-700 bg-white hover:bg-gray-50">Cancel</button>
            <button type="submit" disabled={loading} className="px-4 py-2 border border-transparent rounded-lg shadow-sm text-sm font-medium text-white bg-blue-600 hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500 disabled:bg-blue-400">
              {loading ? 'Generating...' : 'Generate Invoice'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
