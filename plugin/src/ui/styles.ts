// The only module that imports the stylesheet. The build inlines a CSS module once per importing file, so importing it from every
// component multiplied the CSS (12 copies, about 300 KB). Everything else imports `styles` from here.
import styles from '../styles.css'

export default styles
