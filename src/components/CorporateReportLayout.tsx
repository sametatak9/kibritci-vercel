import React from 'react';
import { CORPORATE_COMPANY } from '../lib/corporateReportHtml';
import {
  KIBRITCI_REPORT_HEADER_DATA_URL,
  KIBRITCI_REPORT_WATERMARK_DATA_URL,
} from '../lib/reportBrandAssets';

export interface CorporateReportLayoutProps {
  children: React.ReactNode;
  docCode?: string;
  printDate?: string;
  orientation?: 'portrait' | 'landscape';
  className?: string;
}

const headerLogoStyle: React.CSSProperties = {
  height: '75px',
  width: 'auto',
  maxWidth: '220px', /* Reduced to hide the right part containing Teknik Mühendislik */
  display: 'block',
  objectFit: 'cover',
  objectPosition: 'left center',
  marginLeft: '0px',
};

const watermarkStyle: React.CSSProperties = {
  position: 'absolute',
  right: '1.5%',
  top: '50%',
  transform: 'translateY(-50%)',
  width: '420px',
  maxWidth: '52%',
  height: 'auto',
  opacity: 1,
  pointerEvents: 'none',
  zIndex: 0,
};

export const CorporateReportLayout: React.FC<CorporateReportLayoutProps> = ({
  children,
  docCode,
  printDate,
  orientation = 'landscape',
  className = '',
}) => {
  const printDateStr =
    printDate ??
    `${new Date().toLocaleDateString('tr-TR')} ${new Date().toLocaleTimeString('tr-TR', { hour: '2-digit', minute: '2-digit' })}`;

  return (
    <div
      className={`corporate-report corporate-report--${orientation} ${className}`}
      data-orientation={orientation}
      style={{
        position: 'relative',
        background: '#fff',
        display: 'flex',
        flexDirection: 'column',
        minHeight: orientation === 'portrait' ? '277mm' : '190mm',
      }}
    >
      <img
        src={KIBRITCI_REPORT_WATERMARK_DATA_URL}
        alt=""
        aria-hidden
        draggable={false}
        style={watermarkStyle}
        className="corporate-report-watermark-img"
      />

      <header
        className="corporate-report-header"
        style={{
          position: 'relative',
          zIndex: 2,
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'flex-start',
          paddingBottom: '12px',
          marginBottom: '16px',
          flexShrink: 0,
        }}
      >
        <img
          src={KIBRITCI_REPORT_HEADER_DATA_URL}
          alt="Kibritçi İnşaat"
          draggable={false}
          style={headerLogoStyle}
          className="corporate-report-logo-img"
        />
        {docCode && (
          <div className="corporate-report-meta" style={{ textAlign: 'right' }}>
            <span className="corporate-report-doc-code">{docCode}</span>
            <span className="corporate-report-date">Baskı: {printDateStr}</span>
          </div>
        )}
      </header>

      <main className="corporate-report-body" style={{ position: 'relative', zIndex: 1, flex: '1 1 auto' }}>
        {children}
      </main>

      <footer
        className="corporate-report-footer"
        style={{
          position: 'relative',
          zIndex: 2,
          marginTop: 'auto',
          paddingTop: '18px',
          flexShrink: 0,
          fontSize: '6px',
          lineHeight: 1.35,
          color: '#64748b',
        }}
      >
        <div className="corporate-report-footer-line" />
        <div className="corporate-report-footer-grid">
          <div className="corporate-report-footer-col">
            <p className="corporate-report-footer-legal" style={{ fontSize: '5.5px', margin: '0 0 2px', fontWeight: 700, color: '#475569' }}>
              {CORPORATE_COMPANY.legalName}
            </p>
            <p className="corporate-report-footer-address" style={{ fontSize: '5.5px', margin: 0, color: '#94a3b8' }}>
              {CORPORATE_COMPANY.address}
            </p>
          </div>
          <div className="corporate-report-footer-col corporate-report-footer-contact" style={{ fontSize: '5.5px' }}>
            <p style={{ margin: 0 }}>{CORPORATE_COMPANY.phone}</p>
            <p style={{ margin: 0 }}>@: {CORPORATE_COMPANY.email}</p>
          </div>
          <div className="corporate-report-footer-col corporate-report-footer-web" style={{ fontSize: '5.5px' }}>
            <p style={{ margin: 0 }}>{CORPORATE_COMPANY.website}</p>
          </div>
        </div>
      </footer>
    </div>
  );
};

export default CorporateReportLayout;
