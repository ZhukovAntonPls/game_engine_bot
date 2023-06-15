import { js2xml } from 'xml-js';
import { XMLParser, XMLBuilder } from 'fast-xml-parser';

const xmlParser = new XMLParser({
  ignoreAttributes: false,
  allowBooleanAttributes: true,
  attributesGroupName: '$',
  attributeNamePrefix: '',
});

const xmlBuilder = new XMLBuilder({
  ignoreAttributes: false,
  attributesGroupName: '',
  attributeNamePrefix: '_',
});

export function saveToXml(data: any): string {
  return js2xml(data, {
    compact: true,
    ignoreAttributes: false,
    attributesKey: '$',
  });
}

export function parseXml(xmlData: string | Buffer): any {
  return xmlParser.parse(xmlData);
}

export function buildXml(jObj: any): any {
  return xmlBuilder.build(jObj);
}
