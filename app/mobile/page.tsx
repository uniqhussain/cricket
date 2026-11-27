import CricketApp from '../cricket-app'
import './mobile.css'

export default function MobilePage() {
  return <div className="mobile-app">
    <CricketApp loginRequired rememberSession />
  </div>
}
