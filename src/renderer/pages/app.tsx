import { useMemo, useState } from 'react'
import type { V2NavigationTarget } from '@shared/contracts/index'
import { CircleDollarSign, ClipboardList, LayoutDashboard, Landmark, LineChart, Package, Settings, Users, WalletCards } from 'lucide-react'
import { YumiButton } from '../components/ui'
import { CustomersPage } from './customers'
import { FinancePage } from './finance'
import { FulfillmentPage } from './fulfillment'
import { OrdersPage } from './orders'
import { ProductsPage } from './products'
import { ReportsPage } from './reports'
import { SettlementsPage } from './settlements'
import { SettingsPage } from './settings'
import { WorkbenchPage } from './workbench'

type View = 'workbench' | 'orders' | 'fulfillment' | 'settlements' | 'finance' | 'reports' | 'customers' | 'products' | 'settings'

type NavigationItem = { id: View; label: string; icon: typeof CircleDollarSign }
type WorkbenchView = 'decision' | 'advance'
type NavigationState = { view: View; target: V2NavigationTarget | null }

const navigationGroups: Array<{ label: string; items: NavigationItem[] }> = [
  {
    label: '工作',
    items: [{ id: 'workbench', label: '工作台', icon: LayoutDashboard }]
  },
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
  const [navigation, setNavigation] = useState<NavigationState>({ view: 'workbench', target: null })
  const [workbenchView, setWorkbenchView] = useState<WorkbenchView>('decision')
  const view = navigation.view
  const activeItem = useMemo(() => navigationGroups.flatMap((group) => group.items).find((item) => item.id === view), [view])
  const openNavigationTarget = (target: V2NavigationTarget) => setNavigation({ view: target.view, target })
  const selectNavigation = (nextView: View) => setNavigation({ view: nextView, target: null })
  const returnToWorkbench = () => setNavigation({ view: 'workbench', target: null })

  return (
    <div className="yumi-app-shell">
      <aside className="yumi-app-sidebar">
        <div className="yumi-app-brand">
          <span className="yumi-app-brand__mark">Y</span>
          <span><strong>YUMI</strong><em>STUDIO</em></span>
        </div>
        <nav aria-label="主导航" className="yumi-app-navigation">
          {navigationGroups.map((group) => (
            <section aria-label={group.label} className="yumi-app-navigation__group" key={group.label}>
              <p className="yumi-app-navigation__label">{group.label}</p>
              {group.items.map((item) => {
                const Icon = item.icon
                const active = view === item.id
                return (
                  <YumiButton
                    aria-current={active ? 'page' : undefined}
                    className={active ? 'yumi-app-navigation__item yumi-app-navigation__item--active' : 'yumi-app-navigation__item'}
                    key={item.id}
                    onClick={() => selectNavigation(item.id)}
                    variant="ghost"
                  >
                    <Icon aria-hidden="true" size={17} />
                    {item.label}
                  </YumiButton>
                )
              })}
            </section>
          ))}
        </nav>
        <div className="yumi-app-sidebar__footer">工作室经营管理</div>
      </aside>
      <main className="yumi-app-workspace">
        <header className="yumi-app-command-bar">
          <div><span>YUMI 捏捏工作室</span><strong>{activeItem?.label}</strong></div>
          {navigation.target ? <YumiButton onClick={returnToWorkbench} variant="ghost">返回工作台</YumiButton> : <span>负责人工作台</span>}
        </header>
        <div className="yumi-app-content">
          {view === 'workbench' && <WorkbenchPage initialView={workbenchView} onNavigate={openNavigationTarget} onViewChange={setWorkbenchView} />}
          {view === 'orders' && <OrdersPage navigationTarget={navigation.target?.view === 'orders' ? navigation.target : null} onNavigateToBaseData={selectNavigation} />}
          {view === 'fulfillment' && <FulfillmentPage navigationTarget={navigation.target?.view === 'fulfillment' ? navigation.target : null} onNavigate={openNavigationTarget} />}
          {view === 'settlements' && <SettlementsPage navigationTarget={navigation.target?.view === 'settlements' ? navigation.target : null} />}
          {view === 'finance' && <FinancePage navigationTarget={navigation.target?.view === 'finance' ? navigation.target : null} />}
          {view === 'reports' && <ReportsPage onNavigate={openNavigationTarget} />}
          {view === 'customers' && <CustomersPage onNavigate={openNavigationTarget} />}
          {view === 'products' && <ProductsPage navigationTarget={navigation.target?.view === 'products' ? navigation.target : null} />}
          {view === 'settings' && <SettingsPage />}
        </div>
      </main>
    </div>
  )
}
