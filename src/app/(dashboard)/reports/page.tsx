'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { useUserContext } from '@/components/layout/DashboardLayout';
import { isAdmin } from '@/lib/permissions';
import { UserRole } from '@/types/database';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { ChevronLeft, ChevronRight } from 'lucide-react';
import { format, subMonths, addMonths } from 'date-fns';
import { ROLE_COLORS } from '@/lib/constants/theme';

interface PersonReport {
  user_id: string;
  name: string;
  email: string;
  role: UserRole;
  assigned: number;
  completed: number;
  verified: number;
  on_time: number;
  late: number;
  overdue: number;
}

export default function ReportsPage() {
  const { user } = useUserContext();
  const router = useRouter();
  const [reports, setReports] = useState<PersonReport[]>([]);
  const [loading, setLoading] = useState(true);
  const [month, setMonth] = useState(format(new Date(), 'yyyy-MM'));

  useEffect(() => {
    if (!isAdmin(user.role)) {
      router.push('/dashboard');
      return;
    }
    fetchReports();
  }, [user.role, router, month]);

  async function fetchReports() {
    setLoading(true);
    const res = await fetch(`/api/reports?month=${month}`);
    if (res.ok) {
      setReports(await res.json());
    }
    setLoading(false);
  }

  function prevMonth() {
    const d = new Date(`${month}-01`);
    setMonth(format(subMonths(d, 1), 'yyyy-MM'));
  }

  function nextMonth() {
    const d = new Date(`${month}-01`);
    setMonth(format(addMonths(d, 1), 'yyyy-MM'));
  }

  if (!isAdmin(user.role)) return null;

  const displayMonth = format(new Date(`${month}-01`), 'MMMM yyyy');

  return (
    <div className="space-y-6">
      <h1 className="text-2xl pep-heading">Monthly Reports</h1>

      {/* Month picker */}
      <div className="flex items-center gap-3">
        <Button variant="outline" size="sm" onClick={prevMonth}>
          <ChevronLeft className="w-4 h-4" />
        </Button>
        <div className="flex items-center gap-2">
          <Input
            type="month"
            value={month}
            onChange={(e) => setMonth(e.target.value)}
            className="w-44"
          />
          <span className="text-sm font-medium text-foreground hidden sm:inline">
            {displayMonth}
          </span>
        </div>
        <Button variant="outline" size="sm" onClick={nextMonth}>
          <ChevronRight className="w-4 h-4" />
        </Button>
      </div>

      {/* Reports table */}
      {loading ? (
        <div className="animate-pulse text-muted-foreground">Loading reports...</div>
      ) : reports.length === 0 ? (
        <Card>
          <CardContent className="py-12 text-center text-muted-foreground">
            No data for this month
          </CardContent>
        </Card>
      ) : (
        <Card>
          <CardHeader>
            <CardTitle className="text-lg">
              Task Completion — {displayMonth}
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b text-left">
                    <th className="py-2 pr-4 font-medium text-muted-foreground">
                      Person
                    </th>
                    <th className="py-2 px-3 font-medium text-muted-foreground text-center">
                      Assigned
                    </th>
                    <th className="py-2 px-3 font-medium text-muted-foreground text-center">
                      Completed
                    </th>
                    <th className="py-2 px-3 font-medium text-muted-foreground text-center">
                      Verified
                    </th>
                    <th className="py-2 px-3 font-medium text-muted-foreground text-center">
                      On Time
                    </th>
                    <th className="py-2 px-3 font-medium text-muted-foreground text-center">
                      Late
                    </th>
                    <th className="py-2 px-3 font-medium text-muted-foreground text-center">
                      Overdue
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {reports.map((r) => (
                    <tr key={r.user_id} className="border-b last:border-0">
                      <td className="py-3 pr-4">
                        <div className="flex items-center gap-2">
                          <span className="font-medium">{r.name}</span>
                          <Badge
                            variant="secondary"
                            className={`text-xs ${ROLE_COLORS[r.role]}`}
                          >
                            {r.role.replace('_', ' ')}
                          </Badge>
                        </div>
                      </td>
                      <td className="py-3 px-3 text-center">{r.assigned}</td>
                      <td className="py-3 px-3 text-center">{r.completed}</td>
                      <td className="py-3 px-3 text-center">{r.verified}</td>
                      <td className="py-3 px-3 text-center text-[#4A7A5A]">
                        {r.on_time}
                      </td>
                      <td className="py-3 px-3 text-center text-[#8A7229]">
                        {r.late}
                      </td>
                      <td className="py-3 px-3 text-center text-[#D4705A] font-medium">
                        {r.overdue}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
