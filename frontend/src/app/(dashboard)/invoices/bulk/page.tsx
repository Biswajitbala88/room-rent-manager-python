'use client';
import { useEffect, useMemo, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { api } from '@/lib/api';
import toast from 'react-hot-toast';
import { format } from 'date-fns';
import { Search, CheckCircle, XCircle, Clock } from 'lucide-react';

export default function BulkInvoicePage() {
  const router = useRouter();

  const [month, setMonth] = useState(format(new Date(), 'yyyy-MM'));
  const [rooms, setRooms] = useState<any[]>([]);
  const [tenants, setTenants] = useState<any[]>([]);
  const [invoices, setInvoices] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');

  const [selectedRoomIds, setSelectedRoomIds] = useState<Set<number>>(new Set());
  const [currentReadings, setCurrentReadings] = useState<Record<number, string>>({});
  const [previousReadings, setPreviousReadings] = useState<Record<number, number>>({});

  const [submitting, setSubmitting] = useState(false);
  const [operation, setOperation] = useState<any>(null);
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);

  useEffect(() => {
    const fetchData = async () => {
      try {
        const [roomsRes, tenantsRes, invoicesRes] = await Promise.all([
          api.get('/rooms'),
          api.get('/tenants'),
          api.get('/invoices'),
        ]);
        setRooms(roomsRes.data);
        setTenants(tenantsRes.data);
        setInvoices(invoicesRes.data);
      } catch (error) {
        toast.error('Failed to load rooms/tenants');
      } finally {
        setLoading(false);
      }
    };
    fetchData();
  }, []);

  useEffect(() => {
    return () => {
      if (pollRef.current) clearInterval(pollRef.current);
    };
  }, []);

  // Room -> its currently active tenant (the same "room has one active tenant" rule
  // used everywhere else in the app, e.g. RoomService.delete_room).
  const roomRows = useMemo(() => {
    return rooms.map((room) => {
      const tenant = tenants.find(
        (t) => t.room_no === room.room_no && t.parent_id === room.parent_id && t.status === 'active'
      );
      const alreadyInvoiced = tenant
        ? invoices.some((inv) => inv.tenant_id === tenant.id && inv.month === month)
        : false;
      return { room, tenant, alreadyInvoiced };
    });
  }, [rooms, tenants, invoices, month]);

  const filteredRows = roomRows.filter((r) =>
    r.room.room_no.toLowerCase().includes(search.toLowerCase())
  );
  const selectableRows = filteredRows.filter((r) => r.tenant && !r.alreadyInvoiced);

  const fetchPreviousReading = async (roomNo: string, roomId: number) => {
    try {
      const { data } = await api.get(`/invoices/last-units/${roomNo}/${month}`);
      setPreviousReadings((prev) => ({ ...prev, [roomId]: data.last_units || 0 }));
    } catch (error) {
      setPreviousReadings((prev) => ({ ...prev, [roomId]: 0 }));
    }
  };

  const toggleRoom = (roomId: number, roomNo: string) => {
    setSelectedRoomIds((prev) => {
      const next = new Set(prev);
      if (next.has(roomId)) {
        next.delete(roomId);
      } else {
        next.add(roomId);
        fetchPreviousReading(roomNo, roomId);
      }
      return next;
    });
  };

  const selectAll = () => {
    const ids = new Set(selectableRows.map((r) => r.room.id));
    setSelectedRoomIds(ids);
    selectableRows.forEach((r) => fetchPreviousReading(r.room.room_no, r.room.id));
  };

  const unselectAll = () => setSelectedRoomIds(new Set());

  // Re-fetch previous readings for already-selected rooms whenever the month changes,
  // and drop any selected room that's no longer valid (already invoiced) for the new month.
  useEffect(() => {
    setSelectedRoomIds((prev) => {
      const next = new Set<number>();
      prev.forEach((id) => {
        const row = roomRows.find((r) => r.room.id === id);
        if (row && row.tenant && !row.alreadyInvoiced) {
          next.add(id);
          fetchPreviousReading(row.room.room_no, id);
        }
      });
      return next;
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [month]);

  const selectedRows = roomRows.filter((r) => selectedRoomIds.has(r.room.id));

  const handleReadingChange = (roomId: number, value: string) => {
    setCurrentReadings((prev) => ({ ...prev, [roomId]: value }));
  };

  const isRowValid = (roomId: number) => {
    const value = parseFloat(currentReadings[roomId]);
    const previous = previousReadings[roomId] ?? 0;
    return !isNaN(value) && value >= previous;
  };

  const canSubmit =
    selectedRows.length > 0 &&
    selectedRows.every((r) => isRowValid(r.room.id)) &&
    !submitting;

  const pollOperation = (operationId: number) => {
    pollRef.current = setInterval(async () => {
      try {
        const { data } = await api.get(`/invoices/bulk/${operationId}`);
        setOperation(data);
        if (data.status !== 'pending' && data.status !== 'processing') {
          if (pollRef.current) clearInterval(pollRef.current);
          toast.success(
            `Invoice creation ${data.status.replace('_', ' ')}. Completed: ${data.completed_count}, Failed: ${data.failed_count}, Skipped: ${data.skipped_count}`
          );
        }
      } catch (error) {
        if (pollRef.current) clearInterval(pollRef.current);
      }
    }, 2000);
  };

  const handleSubmit = async () => {
    setSubmitting(true);
    try {
      const payload = {
        month,
        rooms: selectedRows.map((r) => ({
          room_id: r.room.id,
          current_reading: parseInt(currentReadings[r.room.id], 10),
        })),
      };
      const { data } = await api.post('/invoices/bulk', payload);
      setOperation(data);
      toast.success(`${data.total_count} invoice creation job(s) queued`);
      pollOperation(data.id);
    } catch (error: any) {
      toast.error(error.response?.data?.detail || 'Failed to start bulk invoice creation');
    } finally {
      setSubmitting(false);
    }
  };

  const resultIcon = (status: string) => {
    if (status === 'completed') return <CheckCircle className="h-4 w-4 text-green-600 dark:text-green-400 inline" />;
    if (status === 'failed') return <XCircle className="h-4 w-4 text-red-600 dark:text-red-400 inline" />;
    if (status === 'skipped_duplicate') return <XCircle className="h-4 w-4 text-orange-500 inline" />;
    return <Clock className="h-4 w-4 text-gray-400 inline animate-pulse" />;
  };

  if (loading) return <div className="text-center py-10 dark:text-white">Loading rooms...</div>;

  return (
    <div className="max-w-4xl mx-auto space-y-6">
      <h1 className="text-2xl font-bold text-gray-900 dark:text-white">Bulk Create Invoices</h1>

      <div className="bg-white dark:bg-gray-800 p-6 rounded-xl shadow-sm border border-gray-100 dark:border-gray-700 space-y-6">
        <div className="max-w-xs">
          <label className="block text-sm font-medium text-gray-700 dark:text-gray-300">Invoice Month</label>
          <input
            type="month"
            value={month}
            onChange={(e) => setMonth(e.target.value)}
            className="mt-1 block w-full rounded-lg border-gray-300 dark:border-gray-600 dark:bg-gray-700 dark:text-white shadow-sm focus:border-blue-500 focus:ring-blue-500"
          />
        </div>

        <div>
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 mb-3">
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300">Rooms</label>
            <div className="flex items-center gap-3">
              <div className="relative">
                <Search className="h-4 w-4 absolute left-2.5 top-1/2 -translate-y-1/2 text-gray-400" />
                <input
                  type="text"
                  placeholder="Search room..."
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  className="pl-8 text-sm rounded-lg border-gray-300 dark:border-gray-600 dark:bg-gray-700 dark:text-white"
                />
              </div>
              <button type="button" onClick={selectAll} className="text-xs font-medium text-blue-600 dark:text-blue-400 hover:underline">
                Select All
              </button>
              <button type="button" onClick={unselectAll} className="text-xs font-medium text-gray-500 dark:text-gray-400 hover:underline">
                Unselect All
              </button>
            </div>
          </div>

          <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-2 max-h-64 overflow-y-auto p-1">
            {filteredRows.map(({ room, tenant, alreadyInvoiced }) => {
              const disabled = !tenant || alreadyInvoiced;
              return (
                <label
                  key={room.id}
                  title={!tenant ? 'No active tenant' : alreadyInvoiced ? 'Already invoiced this month' : ''}
                  className={`flex items-center gap-2 px-3 py-2 rounded-lg border text-sm ${
                    disabled
                      ? 'border-gray-100 dark:border-gray-700 text-gray-400 dark:text-gray-600 cursor-not-allowed bg-gray-50 dark:bg-gray-900/40'
                      : 'border-gray-200 dark:border-gray-600 text-gray-800 dark:text-gray-200 cursor-pointer hover:bg-gray-50 dark:hover:bg-gray-700/50'
                  }`}
                >
                  <input
                    type="checkbox"
                    disabled={disabled}
                    checked={selectedRoomIds.has(room.id)}
                    onChange={() => toggleRoom(room.id, room.room_no)}
                    className="h-4 w-4 text-blue-600 focus:ring-blue-500 border-gray-300 rounded dark:bg-gray-700 dark:border-gray-600"
                  />
                  <span className="flex-1">
                    Room {room.room_no}
                    {!tenant && <span className="block text-[10px] text-gray-400">No tenant</span>}
                    {alreadyInvoiced && <span className="block text-[10px] text-orange-500">Already invoiced</span>}
                  </span>
                </label>
              );
            })}
          </div>
        </div>

        {selectedRows.length > 0 && (
          <div className="overflow-x-auto">
            <table className="min-w-full divide-y divide-gray-200 dark:divide-gray-700">
              <thead className="bg-gray-50 dark:bg-gray-900/50">
                <tr>
                  <th className="px-4 py-2 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase">Room</th>
                  <th className="px-4 py-2 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase">Tenant</th>
                  <th className="px-4 py-2 text-right text-xs font-medium text-gray-500 dark:text-gray-400 uppercase">Previous</th>
                  <th className="px-4 py-2 text-right text-xs font-medium text-gray-500 dark:text-gray-400 uppercase">Current</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100 dark:divide-gray-700">
                {selectedRows.map(({ room, tenant }) => {
                  const previous = previousReadings[room.id];
                  const valid = isRowValid(room.id);
                  return (
                    <tr key={room.id}>
                      <td className="px-4 py-2 text-sm font-medium text-gray-900 dark:text-white whitespace-nowrap">Room {room.room_no}</td>
                      <td className="px-4 py-2 text-sm text-gray-600 dark:text-gray-300 whitespace-nowrap">{tenant?.name}</td>
                      <td className="px-4 py-2 text-right text-sm text-gray-500 dark:text-gray-400">
                        {previous === undefined ? '...' : previous}
                      </td>
                      <td className="px-4 py-2 text-right">
                        <input
                          type="number"
                          value={currentReadings[room.id] || ''}
                          onChange={(e) => handleReadingChange(room.id, e.target.value)}
                          className={`w-28 text-right text-sm rounded-lg dark:bg-gray-700 dark:text-white ${
                            currentReadings[room.id] && !valid ? 'border-red-400' : 'border-gray-300 dark:border-gray-600'
                          }`}
                        />
                        {currentReadings[room.id] && !valid && (
                          <div className="text-[10px] text-red-500 mt-0.5">Below previous reading</div>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}

        {operation && (
          <div className="p-4 bg-gray-50 dark:bg-gray-700/30 rounded-xl border border-gray-100 dark:border-gray-700 space-y-3">
            <div className="flex items-center justify-between">
              <h3 className="text-sm font-semibold text-gray-800 dark:text-gray-200">
                Bulk Invoice Creation — {operation.status.replace('_', ' ')}
              </h3>
              <span className="text-xs text-gray-500 dark:text-gray-400">
                Total: {operation.total_count} | Completed: {operation.completed_count} | Failed: {operation.failed_count} | Skipped: {operation.skipped_count}
              </span>
            </div>
            <div className="space-y-1">
              {operation.items.map((item: any) => (
                <div key={item.id} className="flex items-center justify-between text-xs">
                  <span className="text-gray-700 dark:text-gray-300">
                    {resultIcon(item.status)} Room {item.room_no || item.room_id}
                  </span>
                  <span className={item.status === 'failed' || item.status === 'skipped_duplicate' ? 'text-red-500' : 'text-gray-500 dark:text-gray-400'}>
                    {item.error_message || item.status}
                  </span>
                </div>
              ))}
            </div>
          </div>
        )}

        <div className="pt-4 flex justify-end gap-3 border-t border-gray-100 dark:border-gray-700">
          <button
            type="button"
            onClick={() => router.push('/invoices')}
            className="px-4 py-2 border border-gray-300 dark:border-gray-600 rounded-lg text-sm font-medium text-gray-700 dark:text-gray-300 bg-white dark:bg-gray-700 hover:bg-gray-50 dark:hover:bg-gray-600"
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={handleSubmit}
            disabled={!canSubmit}
            className="px-4 py-2 border border-transparent rounded-lg shadow-sm text-sm font-medium text-white bg-blue-600 hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500 disabled:bg-blue-400 disabled:cursor-not-allowed"
          >
            {submitting ? 'Queuing...' : `Create ${selectedRows.length} Invoice${selectedRows.length === 1 ? '' : 's'}`}
          </button>
        </div>
      </div>
    </div>
  );
}
