import fs from 'fs'
import ts from 'typescript'

const source = './dist/';
const targetRoot = '../idosell-crawler/';
const target = targetRoot + 'dist/';
const typeFiles = [
    'types.d.ts',
    'paths.d.ts'
]

const tsFiles = [
    'index.ts',
]

const options = {
    outDir: target,
    module: ts.ModuleKind.ESNext,
    target: ts.ScriptTarget.ES2022,
    moduleResolution: ts.ModuleResolutionKind.Node10,
    declaration: false,
    allowJs: false,
    esModuleInterop: true,
    forceConsistentCasingInFileNames: true,
    strict: true,
    skipLibCheck: true,
    noEmitOnError: false,
}

function addJsExtensionTransformer() {
    return context => sourceFile => {
        function visitor(node) {
            if (ts.isImportDeclaration(node) || ts.isExportDeclaration(node)) {
                const moduleSpecifier = (node.moduleSpecifier);
                if (moduleSpecifier && ts.isStringLiteral(moduleSpecifier)) {
                    const text = moduleSpecifier.text;
                    if (/^\.\.?\//.test(text) && !text.endsWith('.js')) {
                        const updated = ts.factory.createStringLiteral(`${text}.js`);
                        const updatedNode = ts.isImportDeclaration(node)
                            ? ts.factory.updateImportDeclaration(
                                node,
                                node.modifiers,
                                node.importClause,
                                updated,
                                node.assertClause
                            )
                            : ts.factory.updateExportDeclaration(
                                node,
                                node.modifiers,
                                node.isTypeOnly,
                                node.exportClause,
                                updated,
                                node.assertClause
                            );
                        return updatedNode;
                    }
                }
            }
            return ts.visitEachChild(node, visitor, context);
        }

        return ts.visitNode(sourceFile, visitor);
    };
}

function compileTypeScript(fileNames) {
    const program = ts.createProgram(fileNames, options);
    const emitResult = program.emit(undefined, undefined, undefined, undefined, {
        before: [addJsExtensionTransformer()],
    });

    const allDiagnostics = ts
        .getPreEmitDiagnostics(program)
        .concat(emitResult.diagnostics);

    allDiagnostics.forEach((diagnostic) => {
        if (diagnostic.file) {
            const { line, character } = ts.getLineAndCharacterOfPosition(
                diagnostic.file,
                diagnostic.start
            );
            const message = ts.flattenDiagnosticMessageText(
                diagnostic.messageText,
                '\n'
            );
            console.log(
                `${diagnostic.file.fileName}:${line}): ${message}`
            );
        } else {
            console.log(
                ts.flattenDiagnosticMessageText(diagnostic.messageText, '\n')
            );
        }
    });
}

function remakeEnums() {
    let enumContents = fs.readFileSync(source + 'paths.d.ts', 'utf-8')
    const declarations = enumContents.matchAll(/export enum ([A-Z_]+)/g);
    const xports = [];
    for (const [, declaration ] of declarations) {
        xports.push(declaration);
    }
    enumContents = enumContents.replaceAll('export enum ', 'enum ');
    enumContents += '\r\nexport default PATHS;';
    fs.writeFileSync(source + 'paths.ts', enumContents);
}

remakeEnums();

compileTypeScript(tsFiles.map(filename => source + filename))

for (const file of typeFiles) {
    fs.copyFileSync(source + '/' + file, target + file);
}

const pkg = fs.readFileSync('./package.json', 'utf-8');

let versionLine;
for (const line of pkg.split("\n")) {
    if (line.indexOf('version') > 0) {
        versionLine = line.trim();
        break;
    }
}

const { version } = JSON.parse(`{${versionLine.slice(0, -1)}}`);
let pkg2 = fs.readFileSync(targetRoot + 'package.json', 'utf-8');
pkg2 = pkg2.replace(/"version": "(.+?)"/, `"version": "${version}"`)
fs.writeFileSync(targetRoot + 'package.json', pkg2);