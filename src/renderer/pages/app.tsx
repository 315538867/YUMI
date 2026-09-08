import { useState } from 'react'
import { Badge, Button, Text } from '@radix-ui/themes'
import { CircleDollarSign, ClipboardList, Landmark, Package, Settings, Users, WalletCards } from 'lucide-react'
import { CustomersPage } from './customers'
import { FinancePage } from './finance'
import { FulfillmentPage } from './fulfillment'
import { OrdersPage } from './orders'
import { ProductsPage } from './products'
import { SettlementsPage } from './settlements'
import { SettingsPage } from './settings'

type View = 'orders' | 'fulfillment' | 'settlements' | 'finance' | 'customers' | 'products' | 'settings'

const navigation: Array<{ id: View; label: string; icon: typeof CircleDollarSign }> = [
  { id: 'orders', label: '订单', icon: CircleDollarSign },
  { id: 'fulfillment', label: '履约', icon: ClipboardList },
  { id: 'settlements', label: '工资', icon: WalletCards },
  { id: 'finance', label: '财务', icon: Landmark },
  { id: 'customers', label: '客户', icon: Users },
  { id: 'products', label: '商品', icon: Package },
  { id: 'settings', label: '设置', icon: Settings }
]

export function App() {
  const [view, setView] = useState<View>('orders')

  return (
    <div className="app-shell">
      <aside className="sidebar">
        <div className="brand"><span className="brand-mark">Y</span><span>YUMI <em>STUDIO V2</em></span></div>
        <nav aria-label="主导航">
          {navigation.map((item) => {
            const Icon = item.icon
            return <Button key={item.id} variant={view === item.id ? 'soft' : 'ghost'} color="gray" className="nav-item" onClick={() => setView(item.id)}>
              <Icon size={17} />{item.label}
            </Button>
          })}
        </nav>
        <div className="sidebar-bottom"><Text size="1" color="gray">订单与资金先行</Text><Badge color="orange">V2</Badge></div>
      </aside>
      <main className="workspace">
        <header className="command-bar"><Text color="gray" size="2">YUMI 捏捏工作室管理系统</Text><Badge color="green">本地数据已隔离</Badge></header>
        <div className="content">
          {view === 'orders' && <OrdersPage />}
          {view === 'fulfillment' && <FulfillmentPage />}
          {view === 'settlements' && <SettlementsPage />}
          {view === 'finance' && <FinancePage />}
          {view === 'customers' && <CustomersPage />}
          {view === 'products' && <ProductsPage />}
          {view === 'settings' && <SettingsPage />}
        </div>
      </main>
    </div>
  )
}
