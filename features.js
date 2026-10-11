// Public feature pages. Private applications are never stored in the public repository.
(() => {
  const site = window.GCNHRSite;
  const safeUrl = (value, externalOnly = false) => {
    if (!value) return null;
    try {
      const url = new URL(value, location.href);
      if (url.protocol !== 'https:' && !(url.protocol === 'http:' && url.origin === location.origin)) return null;
      if (externalOnly && url.protocol !== 'https:') return null;
      return url.href;
    } catch { return null; }
  };
  const localize = (value) => typeof value === 'string' ? value : value?.[site.language] || value?.en || '';
  function render() {
    const settings = site.content.settings || {};
    document.querySelectorAll('.feature-form').forEach(form => {
      const endpoint = safeUrl(settings[form.dataset.kind === 'newsletter' ? 'newsletterEndpoint' : 'applicationEndpoint'], true);
      form.querySelector('[data-submit]').textContent = site.t(endpoint ? 'featureSend' : 'featurePrepare');
      const delivery = form.querySelector('[data-delivery]');
      delivery.textContent = site.t(endpoint ? 'featureDirectDelivery' : 'featureEmailDelivery');
      const privacy = safeUrl(settings[form.dataset.kind === 'newsletter' ? 'newsletterPrivacyUrl' : 'applicationPrivacyUrl'], true);
      if (endpoint && privacy) {
        const link = document.createElement('a'); link.href = privacy; link.textContent = site.t('featureReadServicePrivacy');
        delivery.append(' ', link);
      }
    });
    const fee = document.querySelector('[data-fee]');
    if (fee) fee.textContent = settings.membershipFee || site.t('featureFeePending');
    const portal = document.querySelector('[data-portal]');
    if (portal) {
      portal.href = safeUrl(settings.memberPortalUrl, true) || `mailto:${settings.contactEmail || 'info@gcnhr.org'}?subject=GCNHR%20membership%20support`;
      portal.textContent = site.t(safeUrl(settings.memberPortalUrl, true) ? 'featurePortal' : 'featureMemberSupport');
    }
    const donate = document.querySelector('[data-donate]');
    if (donate) {
      const url = safeUrl(settings.donationUrl, true);
      donate.href = url || '#contribution';
      donate.textContent = site.t(url ? 'featureDonateOnline' : 'featureContribution');
      document.querySelector('[data-donation-note]').hidden = Boolean(url);
    }
    renderCollections();
    // Carry the selected language and unpublished preview into other site pages.
    document.querySelectorAll('a[href]').forEach(link => {
      const raw = link.getAttribute('href');
      if (!raw || raw.startsWith('#')) return;
      const url = new URL(raw, location.href);
      if (url.origin !== location.origin || !(/\.html$/.test(url.pathname) || url.pathname.endsWith('/'))) return;
      url.searchParams.set('lang', site.language);
      if (new URL(location.href).searchParams.has('preview')) url.searchParams.set('preview', '1');
      link.href = url.href;
    });
  }
  function renderCollections() {
    const query = document.querySelector('#feature-search')?.value.toLocaleLowerCase().trim() || '';
    document.querySelectorAll('[data-collection]').forEach(wrap => {
      const kind = wrap.dataset.collection;
      const records = site.content.collections?.[kind] || [];
      wrap.replaceChildren();
      records.filter(item => [localize(item.title), localize(item.description), item.category, item.date, item.location].join(' ').toLocaleLowerCase().includes(query)).forEach(item => {
        const card = document.createElement('article'); card.className = 'feature-card';
        const heading = document.createElement('h3'); heading.textContent = localize(item.title); card.append(heading);
        const meta = document.createElement('p'); meta.className = 'eyebrow'; meta.textContent = [item.date, item.category, item.location].filter(Boolean).join(' · '); card.append(meta);
        const description = document.createElement('p'); description.textContent = localize(item.description); card.append(description);
        const url = safeUrl(item.url);
        if (url) {
          const link = document.createElement('a'); link.href = url; link.className = 'link-arrow'; link.textContent = site.t('featureRead'); card.append(link);
        }
        if (kind === 'events' && item.registrationOpen === true) {
          const button = document.createElement('button'); button.type = 'button'; button.className = 'btn btn-green'; button.textContent = site.t('featureRegister');
          button.addEventListener('click', () => {
            const input = document.querySelector('[name="event"]'); input.value = localize(item.title);
            input.closest('form').scrollIntoView({behavior:'smooth',block:'start'}); input.focus();
          }); card.append(button);
        }
        wrap.append(card);
      });
      const empty = wrap.nextElementSibling;
      if (empty?.hasAttribute('data-empty')) {
        empty.hidden = wrap.childElementCount > 0;
        if (query) empty.textContent = site.t('featureNoResults');
        else empty.textContent = site.t(empty.dataset.i18n) || empty.querySelector('[data-i18n]')?.textContent || site.t('featureEmpty' + kind[0].toUpperCase() + kind.slice(1));
      }
    });
  }
  document.querySelector('#feature-search')?.addEventListener('input', renderCollections);
  document.querySelectorAll('.feature-form').forEach(form => {
    if (form.dataset.kind === 'membership') {
      const category = form.querySelector('[name="category"]');
      const organisation = form.querySelector('[name="organisation"]');
      const updateOrganisation = () => { if (organisation) organisation.required = category?.value === 'institutional'; };
      category?.addEventListener('change', updateOrganisation);
      form.addEventListener('reset', () => setTimeout(updateOrganisation, 0));
      updateOrganisation();
    }
    form.addEventListener('submit', async event => {
      event.preventDefault();
      if (!form.reportValidity()) return;
      const settings = site.content.settings || {};
      const status = form.querySelector('[data-status]');
      const button = form.querySelector('[data-submit]');
      const endpoint = safeUrl(settings[form.dataset.kind === 'newsletter' ? 'newsletterEndpoint' : 'applicationEndpoint'], true);
      const values = new FormData(form); values.set('requestType', form.dataset.kind); values.set('language', site.language);
      if (form.dataset.kind === 'membership') values.set('applicationStatus', 'pending_review');
      status.classList.remove('is-error');
      if (!endpoint) {
        const body = [...values.entries()].map(([key,value]) => `${key}: ${value}`).join('\n');
        location.href = `mailto:${settings.contactEmail || 'info@gcnhr.org'}?subject=${encodeURIComponent('[GCNHR] ' + form.dataset.kind)}&body=${encodeURIComponent(body)}`;
        status.textContent = site.t('featureEmailReady');
        return;
      }
      button.disabled = true; button.textContent = site.t('featureSending');
      try {
        const response = await fetch(endpoint, {method:'POST', body:values, headers:{Accept:'application/json'}});
        if (!response.ok) throw new Error('Submission failed');
        status.textContent = site.t('featureReceived'); form.reset();
      } catch {
        status.textContent = site.t('featureError'); status.classList.add('is-error');
      } finally {button.disabled = false; button.textContent = site.t('featureSend');}
    });
  });
  window.addEventListener('gcnhr:content', render);
  render();
})();
