let suggestionSequence = 0;

export function normalizeText(value) {
    return String(value || '')
        .toLowerCase()
        .normalize('NFD')
        .replace(/[\u0300-\u036f]/g, '')
        .replace(/[^a-z0-9\s]/g, '')
        .replace(/\s+/g, ' ')
        .trim();
}

export function medicationDisplayName(medication) {
    return [medication?.name, medication?.presentation].filter(Boolean).join(' · ');
}

export function attachMedicationAutocomplete({
    input,
    getMedications,
    onSelect,
    onInput,
    getMeta = (medication) => medication?.presentation || '',
    limit = 8,
    ariaLabel = 'Sugerencias de medicamentos'
}) {
    if (!input) return null;

    const wrapper = document.createElement('div');
    wrapper.className = 'medication-autocomplete';
    input.parentNode.insertBefore(wrapper, input);
    wrapper.append(input);

    suggestionSequence += 1;
    const suggestionId = input.id
        ? `${input.id}-suggestions`
        : `medication-suggestions-${suggestionSequence}`;
    const suggestions = document.createElement('div');
    suggestions.id = suggestionId;
    suggestions.className = 'medication-suggestions';
    suggestions.setAttribute('role', 'listbox');
    suggestions.setAttribute('aria-label', ariaLabel);
    suggestions.hidden = true;
    wrapper.append(suggestions);

    input.autocomplete = 'off';
    input.setAttribute('role', 'combobox');
    input.setAttribute('aria-autocomplete', 'list');
    input.setAttribute('aria-haspopup', 'listbox');
    input.setAttribute('aria-expanded', 'false');
    input.setAttribute('aria-controls', suggestionId);

    let activeIndex = -1;
    let visibleMedications = [];
    let hideTimer = null;

    function hideSuggestions() {
        window.clearTimeout(hideTimer);
        suggestions.hidden = true;
        suggestions.replaceChildren();
        visibleMedications = [];
        activeIndex = -1;
        input.setAttribute('aria-expanded', 'false');
        input.removeAttribute('aria-activedescendant');
    }

    function chooseMedication(medication) {
        onSelect?.(medication);
        hideSuggestions();
    }

    function setActiveOption(index) {
        if (!visibleMedications.length) return;
        activeIndex = (index + visibleMedications.length) % visibleMedications.length;
        suggestions.querySelectorAll('.medication-option').forEach((option, optionIndex) => {
            const selected = optionIndex === activeIndex;
            option.classList.toggle('active', selected);
            option.setAttribute('aria-selected', String(selected));
            if (selected) {
                input.setAttribute('aria-activedescendant', option.id);
                option.scrollIntoView({ block: 'nearest' });
            }
        });
    }

    function renderSuggestions() {
        const terms = normalizeText(input.value).split(/\s+/).filter(Boolean);
        const matches = (getMedications?.() || [])
            .filter((medication) => {
                if (!terms.length) return true;
                const haystack = normalizeText(`${medication.name || ''} ${medication.presentation || ''}`);
                return terms.every((part) => haystack.includes(part));
            })
            .slice(0, limit);

        visibleMedications = matches;
        activeIndex = -1;
        input.removeAttribute('aria-activedescendant');
        suggestions.replaceChildren();
        if (!matches.length) {
            hideSuggestions();
            return;
        }

        matches.forEach((medication, index) => {
            const option = document.createElement('button');
            option.type = 'button';
            option.id = `${suggestionId}-option-${index}`;
            option.className = 'medication-option';
            option.tabIndex = -1;
            option.setAttribute('role', 'option');
            option.setAttribute('aria-selected', 'false');
            option.dataset.medicationId = medication.id;
            const meta = getMeta(medication);
            option.append(textElement('strong', medication.name || 'Medicamento'));
            if (meta) option.append(textElement('span', meta));
            option.addEventListener('pointerdown', (event) => {
                event.preventDefault();
                event.stopPropagation();
                chooseMedication(medication);
            });
            suggestions.append(option);
        });

        suggestions.hidden = false;
        input.setAttribute('aria-expanded', 'true');
    }

    input.addEventListener('input', () => {
        onInput?.(input.value);
        renderSuggestions();
    });
    input.addEventListener('focus', () => {
        window.clearTimeout(hideTimer);
        renderSuggestions();
    });
    input.addEventListener('blur', () => {
        hideTimer = window.setTimeout(hideSuggestions, 120);
    });
    input.addEventListener('keydown', (event) => {
        if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
            if (suggestions.hidden) renderSuggestions();
            if (!visibleMedications.length) return;
            event.preventDefault();
            setActiveOption(event.key === 'ArrowDown' ? activeIndex + 1 : activeIndex - 1);
            return;
        }
        if (event.key === 'Enter') {
            if (suggestions.hidden || !visibleMedications.length) return;
            event.preventDefault();
            chooseMedication(visibleMedications[activeIndex >= 0 ? activeIndex : 0]);
            return;
        }
        if (event.key === 'Escape') hideSuggestions();
    });

    return { hide: hideSuggestions, render: renderSuggestions };
}

function textElement(tag, text, className = '') {
    const element = document.createElement(tag);
    if (className) element.className = className;
    element.textContent = text || '';
    return element;
}
