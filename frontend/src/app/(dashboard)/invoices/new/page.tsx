'use client';
import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { api } from '@/lib/api';
import toast from 'react-hot-toast';
import { format } from 'date-fns';
import { Wallet } from 'lucide-react';

export default function NewInvoicePage() {
  const router = useRouter();
  const [loading, setLoading] = useState(false);
  const [tenants, setTenants] = useState<any[]>([]);
  const [tenantWalletBalance, setTenantWalletBalance] = useState<number>(0);
  const [tenantHasWallet, setTenantHasWallet] = useState<boolean>(false);

  const [formData, setFormData] = useState({
    tenant_id: '',
    month: format(new Date(), 'yyyy-MM'),
    previous_reading: '',
    current_reading: '',
    electricity_units: '',
    water_charge: '',
    received_amount: '0',
    wallet_adjustment: '0',
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

  const fetchTenantWallet = async (tenantId: string) => {
    if (!tenantId) {
      setTenantWalletBalance(0);
      setTenantHasWallet(false);
      return;
    }
    try {
      const { data } = await api.get(`/tenants/${tenantId}`);
      setTenantHasWallet(data.has_wallet || false);
      setTenantWalletBalance(data.wallet_balance || 0);
    } catch (error) {
      console.error("Failed to fetch tenant wallet", error);
      const sel = tenants.find(t => t.id === parseInt(tenantId));
      if (sel) {
        setTenantHasWallet(sel.has_wallet || false);
        setTenantWalletBalance(sel.wallet_balance || 0);
      }
    }
  };

  // Previous reading is always derived from the room's last invoice before this month
  // (chained: this month's previous = last month's current). Never user-editable.
  const fetchPreviousReading = async (tenantId: string, month: string) => {
    const selectedTenant = tenants.find(t => t.id === parseInt(tenantId));
    if (!selectedTenant) return;
    try {
      const { data } = await api.get(`/invoices/last-units/${selectedTenant.room_no}/${month}`);
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
  };

  const handleTenantChange = (e: React.ChangeEvent<HTMLSelectElement>) => {
    const tenant_id = e.target.value;
    setFormData(prev => ({ 
      ...prev, 
      tenant_id, 
      received_amount: '0', 
      wallet_adjustment: '0' 
    }));
    if (tenant_id) {
      fetchTenantWallet(tenant_id);
      if (formData.month) {
        fetchPreviousReading(tenant_id, formData.month);
      }
    } else {
      setTenantWalletBalance(0);
      setTenantHasWallet(false);
    }
  };

  // Re-fetch the chained previous reading whenever the billing month changes too
  useEffect(() => {
    if (formData.tenant_id && formData.month) {
      fetchPreviousReading(formData.tenant_id, formData.month);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [formData.month, tenants]);

  // Sync wallet balance when tenant_id changes
  useEffect(() => {
    if (formData.tenant_id) {
      fetchTenantWallet(formData.tenant_id);
    } else {
      setTenantWalletBalance(0);
      setTenantHasWallet(false);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [formData.tenant_id, tenants]);

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

  const selectedTenant = tenants.find(t => t.id === parseInt(formData.tenant_id));
  const previewRent = selectedTenant?.rent_amount || 0;
  const previewElectricity = (parseFloat(formData.electricity_units) || 0) * 10;
  const previewWater = parseFloat(formData.water_charge) || 0;
  const previewWifi = selectedTenant?.has_wifi ? parseFloat(selectedTenant.wifi_rate) || 0 : 0;
  const previewAdvanceApplied = selectedTenant && formData.is_closer && (selectedTenant.is_advanced || selectedTenant.advance_amount > 0)
    ? (selectedTenant.advance_amount > 0 ? selectedTenant.advance_amount : selectedTenant.rent_amount)
    : 0;
  const payableTotal = selectedTenant ? previewRent + previewElectricity + previewWater + previewWifi - previewAdvanceApplied : 0;
  const outstandingDue = selectedTenant
    ? Math.max(0, payableTotal - (parseFloat(formData.wallet_adjustment) || 0) - (parseFloat(formData.received_amount) || 0))
    : 0;

  const handleSetFullAmount = () => {
    const walletAdj = parseFloat(formData.wallet_adjustment) || 0;
    const netDue = Math.max(0, payableTotal - walletAdj);
    setFormData(prev => ({ ...prev, received_amount: netDue.toFixed(2) }));
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const prevReading = parseFloat(formData.previous_reading) || 0;
    const currReading = parseFloat(formData.current_reading) || 0;

    if (currReading < prevReading) {
      toast.error('Current reading cannot be less than previous reading');
      return;
    }

    const walletAdj = parseFloat(formData.wallet_adjustment) || 0;
    if (walletAdj > 0) {
      if (!tenantHasWallet) {
        toast.error('Selected tenant does not have a digital wallet enabled');
        return;
      }
      if (walletAdj > tenantWalletBalance) {
        toast.error(`Insufficient wallet balance. Available: ₹${tenantWalletBalance.toFixed(2)}`);
        return;
      }
      if (walletAdj > payableTotal) {
        toast.error(`Wallet adjustment cannot exceed payable total (₹${payableTotal.toFixed(2)})`);
        return;
      }
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
        received_amount: parseFloat(formData.received_amount) || 0,
        wallet_adjustment: walletAdj
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
              <input type="number" name="previous_reading" disabled value={formData.previous_reading} className="mt-1 block w-full rounded-lg border-gray-350 dark:border-gray-600 bg-gray-50 dark:bg-gray-700/50 dark:text-gray-350 shadow-sm font-semibold cursor-not-allowed" />
              <p className="mt-1 text-xs text-gray-400 dark:text-gray-500">Auto-derived from this room's last invoice</p>
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
              <div className="flex items-center justify-between">
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300">Received Amount (₹)</label>
                {selectedTenant && (
                  <button type="button" onClick={handleSetFullAmount} className="text-xs font-medium text-blue-600 dark:text-blue-400 hover:underline">
                    Set to Payable Total
                  </button>
                )}
              </div>
              <input type="number" step="0.01" name="received_amount" min="0" value={formData.received_amount} onChange={handleChange} className="mt-1 block w-full rounded-lg border-gray-300 dark:border-gray-600 dark:bg-gray-700 dark:text-white shadow-sm focus:border-blue-500 focus:ring-blue-500" />
              <p className="mt-1 text-xs text-gray-400 dark:text-gray-500">Defaults to 0; edit for recorded payment amount</p>
            </div>
            {selectedTenant && tenantHasWallet ? (
              <div className="p-4 bg-blue-50/50 dark:bg-blue-900/10 rounded-lg border border-blue-150 dark:border-blue-800/20 space-y-2">
                <div className="flex justify-between items-center">
                  <label className="block text-xs font-bold text-blue-950 dark:text-blue-300 uppercase">Digital Wallet Reference</label>
                  <span className="text-[11px] font-bold bg-blue-100 dark:bg-blue-900/40 text-blue-850 dark:text-blue-300 px-2 py-0.5 rounded-full">
                    Balance: ₹{tenantWalletBalance.toFixed(2)}
                  </span>
                </div>
                <div>
                  <label className="block text-xs font-semibold text-gray-600 dark:text-gray-400">Wallet Adjustment to Apply (₹)</label>
                  <input
                    type="number"
                    step="0.01"
                    name="wallet_adjustment"
                    min="0"
                    max={tenantWalletBalance}
                    value={formData.wallet_adjustment}
                    onChange={handleChange}
                    className="mt-1 block w-full rounded-lg border-gray-355 dark:border-gray-600 dark:bg-gray-700 dark:text-white shadow-sm focus:border-blue-500 focus:ring-blue-500"
                    placeholder="0.00"
                  />
                  <p className="mt-1 text-[10px] text-gray-500">
                    Deducted from tenant's wallet to reduce outstanding due.
                  </p>
                </div>
              </div>
            ) : selectedTenant ? (
              <div className="flex items-center justify-center p-4 bg-gray-50 dark:bg-gray-700/20 rounded-lg border border-gray-150 dark:border-gray-700/50">
                <p className="text-xs text-gray-500 dark:text-gray-450 italic">
                  Digital Wallet is not enabled for this tenant.
                </p>
              </div>
            ) : null}
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

          {selectedTenant && (
            <div className="p-4 bg-gray-50 dark:bg-gray-700/30 rounded-xl border border-gray-100 dark:border-gray-700 space-y-2">
              <h3 className="text-sm font-semibold text-gray-800 dark:text-gray-200">Invoice Summary Preview</h3>
              <div className="grid grid-cols-2 gap-y-1.5 text-xs text-gray-600 dark:text-gray-400">
                <span>Room Rent:</span>
                <span className="text-right font-medium text-gray-800 dark:text-gray-200">₹{previewRent.toFixed(2)}</span>

                <span>Electricity ({parseFloat(formData.electricity_units) || 0} units @ ₹10):</span>
                <span className="text-right font-medium text-gray-800 dark:text-gray-200">₹{previewElectricity.toFixed(2)}</span>

                <span>Water Charge:</span>
                <span className="text-right font-medium text-gray-800 dark:text-gray-200">₹{previewWater.toFixed(2)}</span>

                {selectedTenant.has_wifi && (
                  <>
                    <span>Wi-Fi Service Charge:</span>
                    <span className="text-right font-medium text-gray-800 dark:text-gray-200">₹{previewWifi.toFixed(2)}</span>
                  </>
                )}

                {previewAdvanceApplied > 0 && (
                  <>
                    <span className="text-red-500 font-semibold">Advance Adjusted:</span>
                    <span className="text-right font-semibold text-red-500">-₹{previewAdvanceApplied.toFixed(2)}</span>
                  </>
                )}

                <div className="col-span-2 border-t border-dashed border-gray-200 dark:border-gray-650 my-1"></div>

                <span className="text-sm font-bold text-gray-800 dark:text-gray-150">Payable Total:</span>
                <span className="text-right text-sm font-bold text-blue-600 dark:text-blue-400">
                  ₹{payableTotal.toFixed(2)}
                </span>

                {parseFloat(formData.wallet_adjustment) > 0 && (
                  <>
                    <span className="text-blue-600 dark:text-blue-400 font-semibold">Wallet Adjustment:</span>
                    <span className="text-right text-xs font-semibold text-blue-600 dark:text-blue-400">
                      -₹{parseFloat(formData.wallet_adjustment).toFixed(2)}
                    </span>
                  </>
                )}

                {parseFloat(formData.received_amount) > 0 && (
                  <>
                    <span className="text-green-600 dark:text-green-400 font-semibold">Received Payment:</span>
                    <span className="text-right text-xs font-semibold text-green-600 dark:text-green-400 font-medium">
                      -₹{parseFloat(formData.received_amount).toFixed(2)}
                    </span>
                  </>
                )}

                <div className="col-span-2 border-t border-dashed border-gray-250 dark:border-gray-650 my-1"></div>

                <span className="text-sm font-bold text-gray-850 dark:text-gray-200">Outstanding Due:</span>
                <span className="text-right text-sm font-black text-red-655 dark:text-red-400">
                  ₹{outstandingDue.toFixed(2)}
                </span>
              </div>
            </div>
          )}
          
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
