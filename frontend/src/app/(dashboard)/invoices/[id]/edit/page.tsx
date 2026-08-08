'use client';
import { useState, useEffect } from 'react';
import { useRouter, useParams } from 'next/navigation';
import { api } from '@/lib/api';
import toast from 'react-hot-toast';

export default function EditInvoicePage() {
  const router = useRouter();
  const params = useParams();
  const invoiceId = params?.id;

  const [loading, setLoading] = useState(false);
  const [fetching, setFetching] = useState(true);
  const [tenants, setTenants] = useState<any[]>([]);
  
  const [formData, setFormData] = useState({
    tenant_id: '',
    month: '',
    previous_reading: '',
    current_reading: '',
    electricity_units: '',
    water_charge: '',
    received_amount: '',
    is_excluded: false
  });

  useEffect(() => {
    const fetchData = async () => {
      if (!invoiceId) return;
      try {
        setFetching(true);
        // Load active and closed tenants (to ensure we can edit older invoices of closed tenants)
        const tenantsRes = await api.get('/tenants');
        setTenants(tenantsRes.data);

        // Load invoice details
        const invoiceRes = await api.get(`/invoices/${invoiceId}`);
        const invoice = invoiceRes.data;

        setFormData({
          tenant_id: invoice.tenant_id.toString(),
          month: invoice.month,
          previous_reading: invoice.previous_reading !== null && invoice.previous_reading !== undefined ? invoice.previous_reading.toString() : '',
          current_reading: invoice.current_reading !== null && invoice.current_reading !== undefined ? invoice.current_reading.toString() : '',
          electricity_units: invoice.electricity_units !== null && invoice.electricity_units !== undefined ? invoice.electricity_units.toString() : '',
          water_charge: invoice.water_charge !== null && invoice.water_charge !== undefined ? invoice.water_charge.toString() : '',
          received_amount: invoice.received_amount !== null && invoice.received_amount !== undefined ? invoice.received_amount.toString() : '',
          is_excluded: invoice.is_excluded
        });
      } catch (err: any) {
        toast.error('Failed to load invoice details');
        router.push('/invoices');
      } finally {
        setFetching(false);
      }
    };
    fetchData();
  }, [invoiceId, router]);

  const handleChange = (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) => {
    const { name, value, type } = e.target;
    const checked = (e.target as HTMLInputElement).checked;

    setFormData(prev => {
      let updatedVal: any = type === 'checkbox' ? checked : value;
      
      const newFormData = {
        ...prev,
        [name]: updatedVal
      };

      // Recalculate electricity units if readings change
      if (name === 'previous_reading' || name === 'current_reading') {
        const prevReading = parseFloat(name === 'previous_reading' ? value : prev.previous_reading) || 0;
        const currReading = parseFloat(name === 'current_reading' ? value : prev.current_reading) || 0;
        newFormData.electricity_units = Math.max(0, currReading - prevReading).toString();
      }

      return newFormData;
    });
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const prevReading = parseFloat(formData.previous_reading) || 0;
    const currReading = parseFloat(formData.current_reading) || 0;

    if (currReading < prevReading) {
      toast.error('Current reading cannot be less than previous reading');
      return;
    }
    setLoading(true);
    try {
      await api.put(`/invoices/${invoiceId}`, {
        ...formData,
        tenant_id: parseInt(formData.tenant_id),
        previous_reading: prevReading,
        current_reading: currReading,
        electricity_units: parseFloat(formData.electricity_units) || 0,
        water_charge: parseFloat(formData.water_charge) || 0,
        received_amount: parseFloat(formData.received_amount) || 0
      });
      toast.success('Invoice updated successfully');
      router.push('/invoices');
    } catch (error: any) {
      toast.error(error.response?.data?.detail || 'Failed to update invoice');
    } finally {
      setLoading(false);
    }
  };

  if (fetching) return <div className="text-center py-10 dark:text-white">Loading invoice details...</div>;

  return (
    <div className="max-w-2xl mx-auto space-y-6">
      <h1 className="text-2xl font-bold text-gray-900 dark:text-white">Edit Invoice</h1>
      <div className="bg-white dark:bg-gray-800 p-6 rounded-xl shadow-sm border border-gray-100 dark:border-gray-700">
        <form onSubmit={handleSubmit} className="space-y-6">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            <div>
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300">Tenant / Room</label>
              <select name="tenant_id" required value={formData.tenant_id} onChange={handleChange} className="mt-1 block w-full rounded-lg border-gray-300 dark:border-gray-600 dark:bg-gray-700 dark:text-white shadow-sm focus:border-blue-500 focus:ring-blue-500">
                {tenants.map(t => (
                  <option key={t.id} value={t.id}>{t.name} (Room {t.room_no})</option>
                ))}
              </select>
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300">Billing Month</label>
              <input type="month" name="month" required value={formData.month} onChange={handleChange} className="mt-1 block w-full rounded-lg border-gray-300 dark:border-gray-600 dark:bg-gray-700 dark:text-white shadow-sm focus:border-blue-500 focus:ring-blue-500" />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300">Previous Meter Reading</label>
              <input type="number" name="previous_reading" required min="0" value={formData.previous_reading} onChange={handleChange} className="mt-1 block w-full rounded-lg border-gray-300 dark:border-gray-600 dark:bg-gray-700 dark:text-white shadow-sm focus:border-blue-500 focus:ring-blue-500" />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300">Current Meter Reading</label>
              <input type="number" name="current_reading" required min="0" value={formData.current_reading} onChange={handleChange} className="mt-1 block w-full rounded-lg border-gray-300 dark:border-gray-600 dark:bg-gray-700 dark:text-white shadow-sm focus:border-blue-500 focus:ring-blue-500" />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300">Calculated Consumed Units</label>
              <input type="number" name="electricity_units" disabled value={formData.electricity_units} className="mt-1 block w-full rounded-lg border-gray-350 dark:border-gray-600 bg-gray-50 dark:bg-gray-700/50 dark:text-gray-350 shadow-sm font-semibold cursor-not-allowed" />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300">Water Charge (₹)</label>
              <input type="number" step="0.01" name="water_charge" required value={formData.water_charge} onChange={handleChange} className="mt-1 block w-full rounded-lg border-gray-300 dark:border-gray-600 dark:bg-gray-700 dark:text-white shadow-sm focus:border-blue-500 focus:ring-blue-500" />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300">Received Amount (₹)</label>
              <input type="number" step="0.01" name="received_amount" min="0" value={formData.received_amount} onChange={handleChange} className="mt-1 block w-full rounded-lg border-gray-300 dark:border-gray-600 dark:bg-gray-700 dark:text-white shadow-sm focus:border-blue-500 focus:ring-blue-500" />
            </div>
          </div>
          
          <div className="space-y-4 pt-4 border-t border-gray-100 dark:border-gray-700">
            <div className="flex items-center">
              <input type="checkbox" id="is_excluded" name="is_excluded" checked={formData.is_excluded} onChange={handleChange} className="h-4 w-4 text-blue-600 focus:ring-blue-500 border-gray-300 rounded dark:bg-gray-700 dark:border-gray-600" />
              <label htmlFor="is_excluded" className="ml-2 block text-sm text-gray-900 dark:text-gray-300">Exclude from Dashboard & Electricity Report</label>
            </div>
          </div>
          
          <div className="pt-6 flex justify-end gap-3 border-t border-gray-100 dark:border-gray-700">
            <button type="button" onClick={() => router.push('/invoices')} className="px-4 py-2 border border-gray-300 dark:border-gray-600 rounded-lg text-sm font-medium text-gray-700 dark:text-gray-300 bg-white dark:bg-gray-700 hover:bg-gray-50 dark:hover:bg-gray-600">Cancel</button>
            <button type="submit" disabled={loading} className="px-4 py-2 border border-transparent rounded-lg shadow-sm text-sm font-medium text-white bg-blue-600 hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500 disabled:bg-blue-400">
              {loading ? 'Saving...' : 'Save Changes'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
