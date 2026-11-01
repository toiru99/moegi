import yaml from 'js-yaml'

class Expression {
  constructor(source) { this.source = source }
}
// Preserve loader expressions as tagged data without evaluating repository configuration.
const schema = yaml.DEFAULT_SCHEMA.extend([new yaml.Type('tag:yaml.org,2002:js', {
  kind: 'scalar', instanceOf: Expression, construct: value => new Expression(value), represent: value => value.source,
})])
export default {
  load: text => yaml.load(text, { schema }),
  dump: (value, options = {}) => yaml.dump(value, { ...options, schema }),
}
