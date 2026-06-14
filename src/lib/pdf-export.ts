import html2canvas from 'html2canvas';
import jsPDF from 'jspdf';

const TAB_TITLES: Record<string, string> = {
  overview: 'Overview Dashboard',
  financial: 'Financial KPIs',
  tat: 'TAT Analysis',
  denial: 'Denial Analysis',
  ar: 'AR Management',
  payer: 'Payer Performance',
  leakage: 'Revenue Leakage',
  'ai-report': 'AI Report',
};

export interface ExportCapture {
  tabId: string;
  canvas: HTMLCanvasElement;
}

export const waitForExportPaint = async (delay = 450) => {
  await new Promise(resolve => setTimeout(resolve, delay));
  await new Promise(resolve => requestAnimationFrame(() => resolve(null)));
  await new Promise(resolve => requestAnimationFrame(() => resolve(null)));
};

type RestorableStyle = {
  node: HTMLElement;
  width: string;
  height: string;
  maxWidth: string;
  overflow: string;
};

type RestorableSvg = {
  node: SVGSVGElement;
  widthAttr: string | null;
  heightAttr: string | null;
  viewBoxAttr: string | null;
  widthStyle: string;
  heightStyle: string;
  overflowStyle: string;
};

const lockChartDimensions = (root: ParentNode) => {
  const sizedNodes = root.querySelectorAll<HTMLElement>('.recharts-responsive-container, .recharts-wrapper');
  const originalStyles: RestorableStyle[] = [];

  sizedNodes.forEach(node => {
    originalStyles.push({
      node,
      width: node.style.width,
      height: node.style.height,
      maxWidth: node.style.maxWidth,
      overflow: node.style.overflow,
    });

    const rect = node.getBoundingClientRect();
    if (rect.width > 0) node.style.width = `${Math.ceil(rect.width)}px`;
    if (rect.height > 0) node.style.height = `${Math.ceil(rect.height)}px`;
    node.style.maxWidth = 'none';
    node.style.overflow = 'visible';
  });

  const svgs = root.querySelectorAll<SVGSVGElement>('svg');
  const originalSvgStyles: RestorableSvg[] = [];

  svgs.forEach(svg => {
    const svgEl = svg as unknown as HTMLElement;
    originalSvgStyles.push({
      node: svg,
      widthAttr: svg.getAttribute('width'),
      heightAttr: svg.getAttribute('height'),
      viewBoxAttr: svg.getAttribute('viewBox'),
      widthStyle: svgEl.style.width,
      heightStyle: svgEl.style.height,
      overflowStyle: svgEl.style.overflow,
    });

    const rect = svg.getBoundingClientRect();
    const width = Math.ceil(rect.width || Number(svg.getAttribute('width')) || 0);
    const height = Math.ceil(rect.height || Number(svg.getAttribute('height')) || 0);

    if (width > 0) svg.setAttribute('width', String(width));
    if (height > 0) svg.setAttribute('height', String(height));
    if (width > 0 && height > 0 && !svg.getAttribute('viewBox')) {
      svg.setAttribute('viewBox', `0 0 ${width} ${height}`);
    }

    svgEl.style.width = width > 0 ? `${width}px` : svgEl.style.width;
    svgEl.style.height = height > 0 ? `${height}px` : svgEl.style.height;
    svgEl.style.overflow = 'visible';
  });

  return () => {
    originalStyles.forEach(({ node, width, height, maxWidth, overflow }) => {
      node.style.width = width;
      node.style.height = height;
      node.style.maxWidth = maxWidth;
      node.style.overflow = overflow;
    });

    originalSvgStyles.forEach(({ node, widthAttr, heightAttr, viewBoxAttr, widthStyle, heightStyle, overflowStyle }) => {
      if (widthAttr === null) node.removeAttribute('width');
      else node.setAttribute('width', widthAttr);

      if (heightAttr === null) node.removeAttribute('height');
      else node.setAttribute('height', heightAttr);

      if (viewBoxAttr === null) node.removeAttribute('viewBox');
      else node.setAttribute('viewBox', viewBoxAttr);

      const svgEl = node as unknown as HTMLElement;
      svgEl.style.width = widthStyle;
      svgEl.style.height = heightStyle;
      svgEl.style.overflow = overflowStyle;
    });
  };
};

export async function captureElementCanvas(contentEl: HTMLElement) {
  if (!contentEl) return null;

  const noPrintEls = contentEl.querySelectorAll<HTMLElement>('.no-print');
  const previousDisplays = Array.from(noPrintEls, el => el.style.display);

  const restoreChartDimensions = lockChartDimensions(contentEl);
  noPrintEls.forEach(el => {
    el.style.display = 'none';
  });

  const originalContainers = Array.from(
    contentEl.querySelectorAll<HTMLElement>('.recharts-responsive-container, .recharts-wrapper')
  ).map(node => {
    const rect = node.getBoundingClientRect();
    return { width: Math.ceil(rect.width), height: Math.ceil(rect.height) };
  });

  const originalSvgs = Array.from(contentEl.querySelectorAll<SVGSVGElement>('svg')).map(node => {
    const rect = node.getBoundingClientRect();
    return { width: Math.ceil(rect.width), height: Math.ceil(rect.height) };
  });

  try {
    await waitForExportPaint();

    return await html2canvas(contentEl, {
      scale: 1.5,
      useCORS: true,
      logging: false,
      foreignObjectRendering: false,
      backgroundColor: '#ffffff',
      windowWidth: Math.max(1440, Math.ceil(contentEl.scrollWidth)),
      windowHeight: Math.max(window.innerHeight, Math.ceil(contentEl.scrollHeight)),
      scrollY: -window.scrollY,
      scrollX: 0,
      allowTaint: true,
      onclone: (clonedDoc) => {
        // Ensure offscreen export surface is fully opaque in the clone
        const surface = clonedDoc.getElementById('dashboard-export-surface');
        if (surface) {
          surface.style.opacity = '1';
          surface.style.transform = 'none';
          surface.style.zIndex = '0';
        }

        const clonedEl = clonedDoc.getElementById('dashboard-tab-content');
        if (!clonedEl) return;

        clonedEl.style.overflow = 'visible';
        clonedEl.style.height = 'auto';
        clonedEl.style.maxWidth = 'none';
        clonedEl.style.width = `${Math.ceil(contentEl.getBoundingClientRect().width)}px`;

        clonedEl.querySelectorAll<HTMLElement>('.no-print').forEach(el => {
          el.style.display = 'none';
        });

        const clonedContainers = clonedEl.querySelectorAll<HTMLElement>('.recharts-responsive-container, .recharts-wrapper');
        clonedContainers.forEach((node, index) => {
          const original = originalContainers[index];
          if (!original) return;
          if (original.width > 0) node.style.width = `${original.width}px`;
          if (original.height > 0) node.style.height = `${original.height}px`;
          node.style.maxWidth = 'none';
          node.style.overflow = 'visible';
        });

        const clonedSvgs = clonedEl.querySelectorAll<SVGSVGElement>('svg');
        clonedSvgs.forEach((svg, index) => {
          const original = originalSvgs[index];
          if (!original) return;
          if (original.width > 0) svg.setAttribute('width', String(original.width));
          if (original.height > 0) svg.setAttribute('height', String(original.height));
          if (original.width > 0 && original.height > 0) {
            svg.setAttribute('viewBox', `0 0 ${original.width} ${original.height}`);
          }
          const svgEl = svg as unknown as HTMLElement;
          svgEl.style.width = original.width > 0 ? `${original.width}px` : svgEl.style.width;
          svgEl.style.height = original.height > 0 ? `${original.height}px` : svgEl.style.height;
          svgEl.style.overflow = 'visible';
        });
      },
    });
  } finally {
    noPrintEls.forEach((el, index) => {
      el.style.display = previousDisplays[index];
    });

    restoreChartDimensions();
  }
}

export async function captureDashboardCanvas() {
  const contentEl = document.getElementById('dashboard-tab-content');
  if (!contentEl) return null;

  return captureElementCanvas(contentEl);
}

const addPageHeader = (
  pdf: jsPDF,
  title: string,
  hospitalName: string,
  dateRange: string,
  sectionIndex: number,
  sectionCount: number,
  pageIndex: number
) => {
  const pageW = pdf.internal.pageSize.getWidth();
  const margin = 10;
  const headerH = 18;

  pdf.setFillColor(180, 30, 30);
  pdf.rect(0, 0, pageW, headerH + margin, 'F');
  pdf.setTextColor(255, 255, 255);
  pdf.setFontSize(14);
  pdf.setFont('helvetica', 'bold');
  pdf.text(`RCM Buddy — ${title}`, margin, margin + 6);
  pdf.setFontSize(8);
  pdf.setFont('helvetica', 'normal');

  const meta = pageIndex === 0
    ? `${hospitalName} · ${dateRange} · Section ${sectionIndex + 1} of ${sectionCount}`
    : `${hospitalName} · ${dateRange} · Continued`;

  pdf.text(meta, margin, margin + 12);
};

const addPageFooter = (pdf: jsPDF) => {
  const pageH = pdf.internal.pageSize.getHeight();
  const margin = 10;
  pdf.setTextColor(150, 150, 150);
  pdf.setFontSize(7);
  pdf.text(
    `Generated by RCM Buddy · ${new Date().toLocaleDateString('en-IN')}`,
    margin,
    pageH - 5
  );
};

const appendCanvasToPdf = (
  pdf: jsPDF,
  canvas: HTMLCanvasElement,
  tabId: string,
  hospitalName: string,
  dateRange: string,
  sectionIndex: number,
  sectionCount: number,
  startOnNewPage: boolean
) => {
  const imgW = canvas.width;
  const imgH = canvas.height;
  if (imgH < 10) return;

  const title = TAB_TITLES[tabId] || tabId;
  const pageW = pdf.internal.pageSize.getWidth();
  const pageH = pdf.internal.pageSize.getHeight();
  const margin = 10;
  const headerH = 18;
  const usableW = pageW - margin * 2;
  const usableH = pageH - margin * 2 - headerH;
  const startY = headerH + margin + 2;
  const CAPTURE_SCALE = 1.5;
  const JPEG_QUALITY = 0.82;
  const scale = usableW / (imgW / CAPTURE_SCALE);
  const scaledH = (imgH / CAPTURE_SCALE) * scale;
  const imgData = canvas.toDataURL('image/jpeg', JPEG_QUALITY);

  if (scaledH <= usableH) {
    if (startOnNewPage) pdf.addPage();
    addPageHeader(pdf, title, hospitalName, dateRange, sectionIndex, sectionCount, 0);
    pdf.addImage(imgData, 'JPEG', margin, startY, usableW, scaledH, undefined, 'FAST');
    addPageFooter(pdf);
    return;
  }

  const pxPerPage = Math.floor((usableH / scale) * CAPTURE_SCALE);
  let srcY = 0;
  let pageIndex = 0;

  while (srcY < imgH) {
    if (startOnNewPage || pageIndex > 0) pdf.addPage();
    addPageHeader(pdf, title, hospitalName, dateRange, sectionIndex, sectionCount, pageIndex);

    const sliceH = Math.min(pxPerPage, imgH - srcY);
    const sliceCanvas = document.createElement('canvas');
    sliceCanvas.width = imgW;
    sliceCanvas.height = sliceH;
    const ctx = sliceCanvas.getContext('2d');
    if (!ctx) return;

    ctx.fillStyle = '#ffffff';
    ctx.fillRect(0, 0, imgW, sliceH);
    ctx.drawImage(canvas, 0, srcY, imgW, sliceH, 0, 0, imgW, sliceH);

    const sliceData = sliceCanvas.toDataURL('image/jpeg', JPEG_QUALITY);
    const sliceScaledH = (sliceH / CAPTURE_SCALE) * scale;
    pdf.addImage(sliceData, 'JPEG', margin, startY, usableW, sliceScaledH, undefined, 'FAST');
    addPageFooter(pdf);

    srcY += pxPerPage;
    pageIndex++;
    startOnNewPage = true;
  }
};

export async function exportTabsToPDF(
  captures: ExportCapture[],
  hospitalName: string,
  dateRange: string
) {
  if (captures.length === 0) return;

  const pdf = new jsPDF({
    orientation: 'portrait',
    unit: 'mm',
    format: 'a4',
    compress: true,
  });

  captures.forEach((capture, index) => {
    appendCanvasToPdf(
      pdf,
      capture.canvas,
      capture.tabId,
      hospitalName,
      dateRange,
      index,
      captures.length,
      index > 0
    );
  });

  pdf.save(`RCM_Buddy_Report_${new Date().toISOString().slice(0, 10)}.pdf`);
}

export async function exportTabToPDF(
  tabId: string,
  hospitalName: string,
  dateRange: string
) {
  const canvas = await captureDashboardCanvas();
  if (!canvas) return;

  await exportTabsToPDF([{ tabId, canvas }], hospitalName, dateRange);
}

export async function printCapturedTabs(
  captures: ExportCapture[],
  hospitalName: string,
  dateRange: string
) {
  if (captures.length === 0) return;

  const printWindow = window.open('', '_blank', 'noopener,noreferrer,width=1200,height=900');
  if (!printWindow) return;

  const sections = captures.map(({ tabId, canvas }, index) => {
    const title = TAB_TITLES[tabId] || tabId;
    const imgData = canvas.toDataURL('image/png');

    return `
      <section class="print-section ${index < captures.length - 1 ? 'page-break' : ''}">
        <header class="print-header">
          <div class="print-title">RCM Buddy — ${title}</div>
          <div class="print-meta">${hospitalName} · ${dateRange}</div>
        </header>
        <img src="${imgData}" alt="${title}" class="print-image" />
      </section>
    `;
  }).join('');

  printWindow.document.open();
  printWindow.document.write(`
    <!doctype html>
    <html>
      <head>
        <title>RCM Buddy Report</title>
        <style>
          :root { color-scheme: light; }
          * { box-sizing: border-box; }
          body { margin: 0; font-family: Arial, sans-serif; background: #fff; color: #111827; }
          .print-section { padding: 16mm 12mm 12mm; }
          .page-break { page-break-after: always; break-after: page; }
          .print-header { margin-bottom: 8mm; border-bottom: 1px solid #e5e7eb; padding-bottom: 4mm; }
          .print-title { font-size: 18px; font-weight: 700; color: #7f1d1d; }
          .print-meta { font-size: 12px; color: #6b7280; margin-top: 4px; }
          .print-image { display: block; width: 100%; height: auto; }
          @page { size: A4 portrait; margin: 0; }
        </style>
      </head>
      <body>${sections}</body>
    </html>
  `);
  printWindow.document.close();

  await new Promise<void>(resolve => {
    const images = Array.from(printWindow.document.images);
    if (images.length === 0) {
      resolve();
      return;
    }

    let loaded = 0;
    const done = () => {
      loaded += 1;
      if (loaded >= images.length) resolve();
    };

    images.forEach(img => {
      if (img.complete) done();
      else {
        img.onload = done;
        img.onerror = done;
      }
    });
  });

  printWindow.focus();
  printWindow.print();
}
