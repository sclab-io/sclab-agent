#!/bin/bash

# install dependancy
yum install centos-release-scl -y
yum clean all
yum install devtoolset-9-* -y
scl enable devtoolset-9 bash

# download and install
GCC_VERSION=9.2.0
wget https://ftp.gnu.org/gnu/gcc/gcc-${GCC_VERSION}/gcc-${GCC_VERSION}.tar.gz
tar xzvf gcc-${GCC_VERSION}.tar.gz
mkdir obj.gcc-${GCC_VERSION}
cd gcc-${GCC_VERSION}
./contrib/download_prerequisites
cd ../obj.gcc-${GCC_VERSION}
../gcc-${GCC_VERSION}/configure --disable-multilib --enable-languages=c,c++
make -j $(nproc)
make install

# update gcc symlink
unlink /lib64/libstdc++.so.6
ln -s /usr/local/lib64/libstdc++.so.6.0.27 /lib64/libstdc++.so.6