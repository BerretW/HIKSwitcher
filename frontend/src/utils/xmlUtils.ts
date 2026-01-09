
/**
 * Removes namespaces and prefixes from an element and converts it to a clean XML string.
 * This is crucial for Loxone which expects simple XML tags.
 */
export const cleanXmlElement = (element: Element): string => {
  const serializer = new XMLSerializer();
  
  // Create a deep clone to avoid modifying the original DOM
  const clone = element.cloneNode(true) as Element;
  
  const removeNamespaces = (el: Element) => {
    // Remove attributes that start with xmlns
    const attrs = Array.from(el.attributes);
    for (const attr of attrs) {
      if (attr.name.startsWith('xmlns')) {
        el.removeAttribute(attr.name);
      }
    }

    // Process children
    const children = Array.from(el.children);
    children.forEach(child => removeNamespaces(child));
  };

  removeNamespaces(clone);

  // Use regex to strip prefixes like <ns0:Tag> to <Tag>
  let xmlString = serializer.serializeToString(clone);
  xmlString = xmlString.replace(/<\/?\w+:(\w+)/g, (match, tagName) => {
    return match.startsWith('</') ? `</${tagName}` : `<${tagName}`;
  });
  
  // Clean up any remaining namespace declarations in the string just in case
  xmlString = xmlString.replace(/\sxmlns(:\w+)?="[^"]*"/g, "");

  return xmlString;
};

/**
 * Extracts constraints from a capability element's attributes.
 */
export const parseCapabilities = (capEl: Element): any => {
  const caps: any = {};
  
  const min = capEl.getAttribute('min');
  const max = capEl.getAttribute('max');
  if (min !== null && max !== null) {
    caps.min = parseInt(min, 10);
    caps.max = parseInt(max, 10);
  }

  const opt = capEl.getAttribute('opt') || capEl.getAttribute('options');
  if (opt) {
    caps.options = opt.split(/[;,]/).map(o => o.trim()).filter(Boolean);
  }

  return caps;
};
