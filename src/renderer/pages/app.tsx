import { useState } from 'react'
import { Button, Text } from '@radix-ui/themes'
import { CircleDollarSign, ClipboardList, Landmark, LineChart, Package, Settings, Users, WalletCards } from 'lucide-react'
import { CustomersPage } from './customers'
import { FinancePage } from './finance'
import { FulfillmentPage } from './fulfillment'
import { OrdersPage } from './orders'
import { ProductsPage } from './products'
import { ReportsPage } from './reports'
import { SettlementsPage } from './settlements'
import { SettingsPage } from './settings'

type View = 'orders' | 'fulfillment' | 'settlements' | 'finance' | 'reports' | 'customers' | 'products' | 'settings'

type NavigationItem = { id: View; label: string; icon: typeof CircleDollarSign }

const navigationGroups: Array<{ label: string; items: NavigationItem[] }> = [
  {
    label: '业务运营',
    items: [
      { id: 'orders', label: '订单', icon: CircleDollarSign },
      { id: 'fulfillment', label: '履约', icon: ClipboardList },
      { id: 'settlements', label: '工资', icon: WalletCards }
    ]
  },
  {
    label: '资金与分析',
    items: [
      { id: 'finance', label: '财务', icon: Landmark },
      { id: 'reports', label: '报表', icon: LineChart }
    ]
  },
  {
    label: '基础资料',
    items: [
      { id: 'customers', label: '客户', icon: Users },
      { id: 'products', label: '商品', icon: Package },
      { id: 'settings', label: '设置', icon: Settings }
    ]
  }
]

export function App() {
  const [view, setView] = useState<View>('orders')

  return (
    <div className="app-shell">
      <aside className="sidebar">
        <div className="brand"><span className="brand-mark">Y</span><span>YUMI <em>STUDIO</em></span></div>
        <nav aria-label="主导航">
          {navigationGroups.map((group) => <section className="navigation-group" key={group.label} aria-label={group.label}>
            <Text className="navigation-group-label" size="1" color="gray">{group.label}</Text>
            {group.items.map((item) => {
              const Icon = item.icon
              return <Button key={item.id} variant={view === item.id ? 'soft' : 'ghost'} color="gray" className="nav-item" onClick={() => setView(item.id)}>
                <Icon size={17} />{item.label}
              </Button>
            })}
          </section>)}
        </nav>
        <div className="sidebar-bottom"><Text size="1" color="gray">工作室经营管理</Text></div>
      </aside>
      <main className="workspace">
        <header className="command-bar"><Text color="gray" size="2">YUMI 捏捏工作室管理系统</Text></header>
        <div className="content">
          {view === 'orders' && <OrdersPage onNavigateToBaseData={setView} />}
          {view === 'fulfillment' && <FulfillmentPage />}
          {view === 'settlements' && <SettlementsPage />}
          {view === 'finance' && <FinancePage />}
          {view === 'reports' && <ReportsPage />}
          {view === 'customers' && <CustomersPage />}
          {view === 'products' && <ProductsPage />}
          {view === 'settings' && <SettingsPage />}
        </div>
      </main>
    </div>
  )
}
