export class SegmentedControl extends HTMLElement {

    constructor() {
        super();
        this.attachShadow({ mode: 'open' });
        this.segments = [];
        this.currentValue = null;
    }

    static get observedAttributes() {
        return ['segments', 'value'];
    }

    parseSegments(segmentDefinition) {
        let segments = []
        
        const segmentList = segmentDefinition.split(',');
        for (let valueDef of segmentList) {
            if (valueDef.includes(':')) {
                let parts = valueDef.split(':');
                segments.push({ label: parts[1], value: parts[0] });
            } else {
                segments.push({ label: valueDef, value: valueDef });
            }
        }

        return segments;
    }

    attributeChangedCallback(name, oldValue, newValue) {
        if (name === 'segments') {
            this.segments = this.parseSegments(newValue);
            this.render();
        } else if (name === 'value') {
            this.currentValue = newValue;
            this.updateButtonStates();
        }
    }

    connectedCallback() {
        if (this.hasAttribute('segments')) {
            this.segments = this.parseSegments(this.getAttribute('segments'));
        }
        if (this.hasAttribute('value')) {
            this.currentValue = this.getAttribute('value');
        }
        this.render();
    }


    render() {
        const link = document.createElement('link');
        link.rel = 'stylesheet';
        link.href = './segmented.css';

        this.shadowRoot.replaceChildren(link);

        this.segments.forEach(segment => {
            const button = document.createElement('button');
            button.textContent = segment.label;
            button.value = segment.value;
            button.onclick = () => this.selectSegment(segment.value);
            if (segment.value === this.currentValue) {
                button.classList.add('active');
            }
            this.shadowRoot.appendChild(button);
        });
}

    selectSegment(value) {
        const oldValue = this.currentValue;
        this.currentValue = value;
        this.setAttribute('value', value);
        this.updateButtonStates();
        const detail = {
            value: this.currentValue,
            oldValue: oldValue
        }
        this.dispatchEvent(new CustomEvent('change', { detail: detail })); // Dispatch change event
    }

    updateButtonStates() {
        const buttons = this.shadowRoot.querySelectorAll('button');
        buttons.forEach(button => {
            button.classList.toggle('active', button.value === this.currentValue);
        });
    }

    getCurrentValue() {
        return this.currentValue;
    }
}
