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
    previous_reading: '',
    current_reading: '',
    electricity_units: '',
    water_charge: '',
    received_amount: '',
    is_closer: false,
    is_excluded: false
  });

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

  // Fetch previous reading when tenant or month changes
  const handleTenantChange = async (e: React.ChangeEvent<HTMLSelectElement>) => {
    const tenant_id = e.target.value;
    setFormData(prev => ({ ...prev, tenant_id }));
    
    if (tenant_id && formData.month) {
      const selectedTenant = tenants.find(t => t.id === parseInt(tenant_id));
      if (selectedTenant) {
        try {
          const { data } = await api.get(`/invoices/last-units/${selectedTenant.room_no}/${formData.month}`);
          const lastReading = data.last_units || 0;
          setFormData(prev => {
            const current = parseFloat(prev.current_reading) > 0 ? parseFloat(prev.current_reading) : lastReading;
            const units = Math.max(0, current - lastReading);
            return {
              ...prev,
              previous_reading: lastReading.toString(),
              current_reading: current.toString(),
              electricity_units: units.toString(),
              water_charge: selectedTenant.is_water_charge ? selectedTenant.water_charge.toString() : '0'
            };
          });
        } catch (error) {
          console.error("Failed to fetch last units");
        }
      }
    }
  };

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
      await api.post('/invoices', {
        ...formData,
        tenant_id: parseInt(formData.tenant_id),
        previous_reading: prevReading,
        current_reading: currReading,
        electricity_units: parseFloat(formData.electricity_units) || 0,
        water_charge: parseFloat(formData.water_charge) || 0,
        received_amount: parseFloat(formData.received_amount) || 0
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
      <h1 className="text-2xl font-bold text-gray-900 dark:text-white font-sans">Generate Invoice</h1>
      <div className="bg-white dark:bg-gray-800 p-6 rounded-xl shadow-sm border border-gray-100 dark:border-gray-700">
        <form onSubmit={handleSubmit} className="space-y-6">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            <div>
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300">Select Tenant / Room</label>
              <select name="tenant_id" required value={formData.tenant_id} onChange={handleTenantChange} className="mt-1 block w-full rounded-lg border-gray-300 dark:border-gray-600 dark:bg-gray-700 dark:text-white shadow-sm focus:border-blue-500 focus:ring-blue-500">
                <option value="">-- Select Tenant --</option>
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
              <input type="checkbox" id="is_closer" name="is_closer" checked={formData.is_closer} onChange={handleChange} className="h-4 w-4 text-blue-600 focus:ring-blue-500 border-gray-300 rounded dark:bg-gray-700 dark:border-gray-600" />
              <label htmlFor="is_closer" className="ml-2 block text-sm font-medium text-red-650">Close Tenant Account (Closing Invoice)</label>
            </div>
            <div className="flex items-center">
              <input type="checkbox" id="is_excluded" name="is_excluded" checked={formData.is_excluded} onChange={handleChange} className="h-4 w-4 text-blue-600 focus:ring-blue-500 border-gray-300 rounded dark:bg-gray-700 dark:border-gray-600" />
              <label htmlFor="is_excluded" className="ml-2 block text-sm text-gray-900 dark:text-gray-300">Exclude from Dashboard & Electricity Report</label>
            </div>
          </div>

          {(() => {
            const selectedTenant = tenants.find(t => t.id === parseInt(formData.tenant_id));
            if (!selectedTenant) return null;
            
            const rent = selectedTenant.rent_amount;
            const electricity = (parseFloat(formData.electricity_units) || 0) * 10;
            const water = parseFloat(formData.water_charge) || 0;
            const advanceApplied = formData.is_closer && (selectedTenant.is_advanced || selectedTenant.advance_amount > 0) 
              ? (selectedTenant.advance_amount > 0 ? selectedTenant.advance_amount : selectedTenant.rent_amount) 
              : 0;
            const total = rent + electricity + water - advanceApplied;

            return (
              <div className="p-4 bg-gray-50 dark:bg-gray-700/30 rounded-xl border border-gray-100 dark:border-gray-700 space-y-2">
                <h3 className="text-sm font-semibold text-gray-800 dark:text-gray-200">Invoice Summary Preview</h3>
                <div className="grid grid-cols-2 gap-y-1.5 text-xs text-gray-600 dark:text-gray-400">
                  <span>Room Rent:</span>
                  <span className="text-right font-medium text-gray-800 dark:text-gray-200">₹{rent.toFixed(2)}</span>
                  
                  <span>Electricity ({parseFloat(formData.electricity_units) || 0} units @ ₹10):</span>
                  <span className="text-right font-medium text-gray-800 dark:text-gray-200">₹{electricity.toFixed(2)}</span>
                  
                  <span>Water Charge:</span>
                  <span className="text-right font-medium text-gray-800 dark:text-gray-200">₹{water.toFixed(2)}</span>
                  
                  {advanceApplied > 0 && (
                    <>
                      <span className="text-red-500 font-semibold">Advance Adjusted:</span>
                      <span className="text-right font-semibold text-red-500">-₹{advanceApplied.toFixed(2)}</span>
                    </>
                  )}
                  
                  <div className="col-span-2 border-t border-dashed border-gray-200 dark:border-gray-650 my-1"></div>
                  
                  <span className="text-sm font-bold text-gray-800 dark:text-gray-150">Payable Total:</span>
                  <span className="text-right text-sm font-bold text-blue-600 dark:text-blue-400">
                    ₹{total.toFixed(2)}
                  </span>
                </div>
              </div>
            );
          })()}
          
          <div className="pt-6 flex justify-end gap-3 border-t border-gray-100 dark:border-gray-700">
            <button type="button" onClick={() => router.push('/invoices')} className="px-4 py-2 border border-gray-300 dark:border-gray-600 rounded-lg text-sm font-medium text-gray-700 dark:text-gray-300 bg-white dark:bg-gray-700 hover:bg-gray-50 dark:hover:bg-gray-600">Cancel</button>
            <button type="submit" disabled={loading} className="px-4 py-2 border border-transparent rounded-lg shadow-sm text-sm font-medium text-white bg-blue-600 hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500 disabled:bg-blue-400">
              {loading ? 'Generating...' : 'Generate Invoice'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
