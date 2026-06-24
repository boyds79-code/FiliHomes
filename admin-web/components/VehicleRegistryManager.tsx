import React, { useState, useEffect } from 'react';
import { supabase } from '../src/lib/supabaseClient';

export default function VehicleRegistryManager({ condoId }: { condoId: string }) {
  const [vehicles, setVehicles] = useState<any[]>([]);

  useEffect(() => {
    fetchVehicles();
  }, []);
const fetchVehicles = async () => {
  // 조인 없이 데이터를 가져온 뒤, 테이블 구조에 맞게 매핑하는 것이 더 안전합니다.
  const { data, error } = await supabase
    .from('vehicles')
    .select('*') // 조인 에러 방지
    .order('created_at', { ascending: false });

  if (error) console.error("Error fetching vehicles:", error);
  else setVehicles(data || []);
};

const deleteVehicle = async (id: number) => {
  if (!confirm('Are you sure you want to delete this vehicle?')) return;
  const { error } = await supabase.from('vehicles').delete().eq('id', id);
  if (!error) fetchVehicles();
};

return (
  <div className="space-y-6">
    <div className="bg-white p-6 rounded-2xl border border-slate-200 shadow-sm">
      <h3 className="text-lg font-bold mb-6">🚗 Vehicle Registry</h3>
      <table className="w-full text-left text-sm">
        <thead className="text-slate-400 uppercase text-xs">
          <tr>
            <th className="py-2">Unit</th>
            <th>Vehicle / Plate</th>
            <th>Status</th>
            <th>Management</th>
          </tr>
        </thead>
        <tbody className="divide-y">
          {vehicles.map((v) => (
            <tr key={v.id} className="hover:bg-slate-50">
              <td className="py-3 font-bold text-slate-800">
                {v.unit_no ? `Unit ${v.unit_no}` : 'N/A'}
              </td>
              <td className="font-bold text-slate-800">{v.vehicle_type} ({v.plate_number})</td>
              <td>
                <span className={`px-2 py-1 rounded text-xs ${v.billing_status === 'Paid' ? 'bg-green-100 text-green-700' : 'bg-red-100 text-red-700'}`}>
                  {v.billing_status} {v.months_unpaid > 0 ? `(${v.months_unpaid}m unpaid)` : ''}
                </span>
              </td>
              <td>
                <button onClick={() => deleteVehicle(v.id)} className="text-red-500 hover:text-red-700 font-bold">
                  Delete
                </button>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  </div>
  );
}